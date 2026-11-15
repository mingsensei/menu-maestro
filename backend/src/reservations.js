// Table reservations, ported from the RTR Spring backend (BookingService/TableService).
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { HttpError } from './errors.js';

export const AREAS = ['TERRACE', 'ROMA', 'VERONA', 'SORRENTO'];
export const AREA_LABELS = { TERRACE: 'Terrace', ROMA: 'Roma', VERONA: 'Verona', SORRENTO: 'Sorrento' };
export const BOOKING_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'];
const BLOCKING = ['PENDING', 'APPROVED'];
const EDITABLE_TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'];
export const OTP_TTL_SECONDS = 120;
export const MAX_ONLINE_GUESTS = 6;
const MAX_SELECTED_TABLES = 3;
const MAX_SELECTED_CAPACITY = 6;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_RESENDS = 3;
const PLACEHOLDER_EMAIL = 'timemap@riversideterrace.local';
const PLACEHOLDER_PHONE = '0000000000';
// Walk-ins and time-map bookings share a placeholder address, so it must not trip the one-booking-per-day rule.
const realEmail = value => Boolean(value) && value !== PLACEHOLDER_EMAIL;

// ---------- validation ----------
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:mm.').transform(value => value.slice(0, 5));
const area = z.enum(AREAS);
const status = z.enum(BOOKING_STATUSES);
const tableIds = z.array(z.coerce.number().int().positive()).min(1).max(20);
const optionalText = max => z.string().trim().max(max).nullish().transform(value => value || null);
const email = z.string().trim().toLowerCase().email().max(160);
const phone = z.string().trim().regex(/^[0-9+\-\s().]{6,32}$/, 'Phone number is invalid.');

export const schemas = {
  availability: z.object({ area, date, startTime: time, endTime: time, guests: z.coerce.number().int().min(1).max(200).default(1) }),
  suggest: z.object({ seating: z.enum(['inside', 'outside']), date, startTime: time, endTime: time, guests: z.coerce.number().int().min(1).max(MAX_ONLINE_GUESTS) }),
  requestOtp: z.object({
    customerName: z.string().trim().min(1).max(120), customerPhone: phone, customerEmail: email,
    bookingDate: date, startTime: time, endTime: time, numberOfGuests: z.number().int().min(1).max(200),
    area, note: optionalText(1000), tableIds,
  }),
  verifyOtp: z.object({ verificationId: z.string().uuid(), otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits.') }),
  resendOtp: z.object({ verificationId: z.string().uuid() }),
  adminBooking: z.object({
    customerName: z.string().trim().min(1).max(120),
    customerEmail: z.union([email, z.literal('')]).nullish(),
    customerPhone: z.union([phone, z.literal('')]).nullish(),
    numberOfGuests: z.number().int().min(1).max(200), bookingDate: date, startTime: time, endTime: time,
    area, tableIds, status: status.nullish(), note: optionalText(1000),
  }),
  reject: z.object({ reason: z.string().trim().min(1).max(1000) }),
  search: z.object({
    date: date.optional(), startTime: time.optional(), endTime: time.optional(), area: area.optional(), status: status.optional(),
    tableNumber: z.string().trim().max(32).optional(), search: z.string().trim().max(160).optional(),
    page: z.coerce.number().int().min(0).max(100000).default(0), size: z.coerce.number().int().min(1).max(100).default(10),
  }),
  table: z.object({
    tableNumber: z.string().trim().min(1).max(32), area, capacity: z.number().int().min(1).max(50),
    status: z.enum(['AVAILABLE', 'HOLD', 'RESERVED', 'OCCUPIED', 'MAINTENANCE']).default('AVAILABLE'),
    x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite(), rotation: z.number().finite().default(0),
    shape: z.enum(['RECTANGLE', 'CIRCLE']).default('RECTANGLE'),
    imageUrl: optionalText(2000), areaImageUrl: optionalText(2000), description: optionalText(500), active: z.boolean().default(true),
  }),
  position: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite(), rotation: z.number().finite().default(0) }),
};

/** Parses query-string params, dropping empty values so optional filters stay optional. */
export const fromQuery = searchParams => Object.fromEntries([...searchParams].filter(([, value]) => value !== ''));

// ---------- pure business rules ----------
const bad = message => new HttpError(400, message);
export const tableNumberValue = table => {
  const digits = String(table.tableNumber ?? table.table_number).replace(/\D/g, '');
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
};

/** Mirrors RTR BookingService.validateTablesForBooking. */
export function validateTablesForBooking(tables, bookingArea, guests) {
  if (tables.length === 0 || tables.length > MAX_SELECTED_TABLES) throw bad('You may select between 1 and 3 tables.');
  if (tables.some(table => !table.active || table.status !== 'AVAILABLE')) throw new HttpError(409, 'The selected table is no longer available.', 'TABLE_NOT_AVAILABLE');
  if (tables.some(table => table.area !== bookingArea)) throw bad('Selected table does not belong to the selected area.');
  const capacity = tables.reduce((sum, table) => sum + table.capacity, 0);
  if (capacity > MAX_SELECTED_CAPACITY) throw bad('Selected tables may have a combined capacity of at most 6.');
  if (capacity < guests) throw bad('Selected table capacity is not enough for this party size.');
  if (bookingArea === 'VERONA' && guests <= 2) throw bad('Verona is only available for parties of 3 or more.');
  const numbers = tables.map(tableNumberValue).sort((a, b) => a - b);
  const consecutive = numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
  if (tables.length > 1 && !consecutive) throw bad('Only adjacent, consecutively numbered tables may be selected.');
  if (bookingArea === 'TERRACE' && numbers.includes(6) && numbers.includes(7)) throw bad('Tables T6 and T7 cannot be joined.');
  if (guests <= 2 && tables.length !== 1) throw bad('Parties of 1-2 guests may select only one table.');
  if (guests >= 3) {
    const key = numbers.join(',');
    const veronaPair = bookingArea === 'VERONA' && guests <= 4 && ['11,12', '13,14', '15,16'].includes(key);
    if (bookingArea === 'VERONA' && numbers.some(number => number >= 11) && !veronaPair) {
      throw bad('V11-12, V13-14 and V15-16 are fixed pairs and cannot be split or joined.');
    }
    if (!veronaPair && (tables.length !== Math.ceil(guests / 2) || !consecutive)) {
      throw bad('Only the required number of consecutively numbered tables may be joined.');
    }
  }
}

/** Areas searched by "suggest best table", in priority order. */
export function suggestionAreas(seating, guests) {
  if (seating === 'outside') return ['TERRACE'];
  return guests <= 2 ? ['ROMA'] : ['VERONA', 'ROMA'];
}

/** Mirrors RTR BookingService.bestTableGroup: adjacent tables closest to the view. */
export function bestTableGroup(bookingArea, available, guests) {
  const byNumber = new Map();
  for (const table of available) if (!byNumber.has(tableNumberValue(table))) byNumber.set(tableNumberValue(table), table);
  if (bookingArea === 'VERONA' && guests >= 3 && guests <= 4) {
    for (const start of [11, 13, 15]) if (byNumber.has(start) && byNumber.has(start + 1)) return [byNumber.get(start), byNumber.get(start + 1)];
  }
  const count = guests <= 2 ? 1 : Math.ceil(guests / 2);
  const viewScore = group => {
    const center = group.reduce((sum, table) => sum + tableNumberValue(table), 0) / group.length;
    return bookingArea === 'VERONA' ? Math.min(Math.abs(center - 10), Math.abs(center - 11)) : Math.abs(center - 6.5);
  };
  let best = [];
  let bestScore = Infinity;
  for (const start of byNumber.keys()) {
    const forbiddenTerrace = bookingArea === 'TERRACE' && count > 1 && start <= 6 && start + count - 1 >= 7;
    const group = [];
    for (let offset = 0; offset < count; offset++) {
      const table = byNumber.get(start + offset);
      if (!table || forbiddenTerrace || (bookingArea === 'VERONA' && start + offset >= 11)) break;
      group.push(table);
    }
    if (group.length === count && viewScore(group) < bestScore) { best = group; bestScore = viewScore(group); }
  }
  return best;
}

export const hashOtp = otp => createHash('sha256').update(otp, 'utf8').digest('hex');

/** Wall-clock date and time at the restaurant. */
export function restaurantNow(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function validateTimeRange(startTime, endTime) {
  if (endTime <= startTime) throw bad('End time must be after start time.');
}

export function validateNotPast(bookingDate, startTime, now) {
  if (bookingDate < now.date || (bookingDate === now.date && startTime < now.time)) throw bad('Booking time cannot be in the past.');
}

// ---------- mapping ----------
const hhmm = value => (value ? String(value).slice(0, 5) : value);
export function toTable(row, derivedStatus = row.status) {
  return {
    id: Number(row.id), tableNumber: row.table_number, area: row.area, capacity: row.capacity,
    floor: row.area, locationName: AREA_LABELS[row.area] || row.area, status: derivedStatus,
    x: row.x, y: row.y, width: row.width, height: row.height, rotation: row.rotation, shape: row.shape,
    imageUrl: row.image_url, areaImageUrl: row.area_image_url, description: row.description, active: row.active,
  };
}
export function toBooking(row) {
  const tables = (row.booking_tables || []).map(link => link.table).filter(Boolean).map(table => toTable(table))
    .sort((a, b) => tableNumberValue(a) - tableNumberValue(b));
  return {
    id: Number(row.id), bookingCode: row.booking_code, customerName: row.customer_name, customerPhone: row.customer_phone,
    customerEmail: row.customer_email, bookingDate: row.booking_date, startTime: hhmm(row.start_time), endTime: hhmm(row.end_time),
    numberOfGuests: row.number_of_guests, area: row.area, note: row.note, rejectionReason: row.rejection_reason,
    status: row.status, emailVerified: row.email_verified, tables, createdAt: row.created_at, updatedAt: row.updated_at,
    approvedAt: row.approved_at, rejectedAt: row.rejected_at,
  };
}
const tableRow = input => ({
  table_number: input.tableNumber, area: input.area, capacity: input.capacity, status: input.status,
  x: input.x, y: input.y, width: input.width, height: input.height, rotation: input.rotation, shape: input.shape,
  image_url: input.imageUrl, area_image_url: input.areaImageUrl, description: input.description, active: input.active,
});
const BOOKING_SELECT = '*, booking_tables(table:restaurant_tables(*))';

function validateBounds({ x, y, width, height }) {
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1200 || y + height > 800) throw bad('Table coordinates are outside the allowed floor plan.');
}

/** Converts PostgREST/RPC errors raised by the reservation functions into API errors. */
export function dbError(error) {
  const message = String(error?.message || '');
  for (const [code, status] of [['TABLE_NOT_AVAILABLE', 409], ['EMAIL_ALREADY_BOOKED_TODAY', 409], ['BOOKING_NOT_FOUND', 404]]) {
    if (message.startsWith(`${code}:`)) return new HttpError(status, message.slice(code.length + 1).trim(), code);
  }
  if (error?.code === '23505') return new HttpError(409, 'A record with the same value already exists.', 'DUPLICATE');
  return new HttpError(502, 'Database request failed. Please try again.');
}
const unwrapDb = ({ data, error }) => { if (error) throw dbError(error); return data; };

// ---------- service ----------
export function createReservations({ db, mailer, timeZone = 'Asia/Ho_Chi_Minh', clock = () => new Date(), logger = console }) {
  const events = new EventEmitter();
  events.setMaxListeners(200);
  const requireDb = () => { if (!db) throw new HttpError(503, 'Reservations are not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.'); return db; };
  const now = () => restaurantNow(timeZone, clock());
  const changed = (bookingId, newCustomerBooking = false) => events.emit('booking.changed', { bookingId, newCustomerBooking });
  const notify = async (kind, booking) => {
    // Walk-in and time-map bookings use a placeholder address; there is nobody to email.
    if (booking.customerEmail === PLACEHOLDER_EMAIL) return undefined;
    try { await mailer.send(kind, booking); return undefined; }
    catch (error) { logger.warn(JSON.stringify({ event: 'booking.email_failed', kind, bookingId: booking.id, error: error.message })); return 'The booking was saved, but the email could not be sent.'; }
  };

  const loadBooking = async id => {
    const row = unwrapDb(await requireDb().from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle());
    if (!row) throw new HttpError(404, 'Booking not found.');
    return toBooking(row);
  };
  const loadTables = async ids => {
    const unique = [...new Set(ids)];
    const rows = unwrapDb(await requireDb().from('restaurant_tables').select('*').in('id', unique));
    if (rows.length !== unique.length) throw bad('One or more selected tables do not exist.');
    return rows.map(row => toTable(row));
  };
  const newCode = () => `RTR-${now().date.replaceAll('-', '')}-${String(randomInt(10000)).padStart(4, '0')}`;
  // tableRule: 'day' (guests: one booking per table per day), 'overlap' (admins: no overlapping times), 'none'.
  const save = async (id, data, ids, { tableRule, checkEmail }) => {
    for (let attempt = 0; ; attempt++) {
      const payload = id ? data : { ...data, booking_code: newCode() };
      const { data: savedId, error } = await requireDb().rpc('booking_save', { p_id: id, p_data: payload, p_table_ids: ids, p_table_rule: tableRule, p_check_email: checkEmail });
      // A random booking code can collide; retry with a fresh one.
      if (error?.code === '23505' && !id && attempt < 4 && String(error.message).includes('booking_code')) continue;
      if (error) throw dbError(error);
      return Number(savedId);
    }
  };
  const transition = async (id, data, { tableRule = 'none', checkEmail = false } = {}) => {
    unwrapDb(await requireDb().rpc('booking_transition', { p_id: id, p_data: data, p_table_rule: tableRule, p_check_email: checkEmail }));
  };

  async function availability({ area: bookingArea, date: bookingDate, startTime, endTime }) {
    validateTimeRange(startTime, endTime);
    validateNotPast(bookingDate, startTime, now());
    const [tables, busy] = await Promise.all([
      requireDb().from('restaurant_tables').select('*').eq('area', bookingArea).eq('active', true).order('id'),
      requireDb().from('bookings').select('status, email_verified, otp_expires_at, booking_tables(table_id)').eq('booking_date', bookingDate).in('status', BLOCKING),
    ]);
    const statuses = new Map();
    const time = clock().getTime();
    for (const booking of unwrapDb(busy)) {
      if (!booking.email_verified && !(Date.parse(booking.otp_expires_at) > time)) continue;
      const derived = booking.status === 'APPROVED' ? 'RESERVED' : 'HOLD';
      for (const { table_id: tableId } of booking.booking_tables) if (statuses.get(Number(tableId)) !== 'RESERVED') statuses.set(Number(tableId), derived);
    }
    return unwrapDb(tables).map(row => toTable(row, statuses.get(Number(row.id)) || row.status)).sort((a, b) => tableNumberValue(a) - tableNumberValue(b));
  }

  return {
    events,
    configured: Boolean(db),
    availability,

    async suggest({ seating, date: bookingDate, startTime, endTime, guests }) {
      for (const candidate of suggestionAreas(seating, guests)) {
        const available = (await availability({ area: candidate, date: bookingDate, startTime, endTime })).filter(table => table.status === 'AVAILABLE');
        const tables = bestTableGroup(candidate, available, guests);
        if (tables.length) return { area: candidate, tables, totalCapacity: tables.reduce((sum, table) => sum + table.capacity, 0) };
      }
      throw new HttpError(404, 'No suitable adjacent tables are available.', 'NO_TABLE_SUGGESTION');
    },

    async tables(areaFilter) {
      let query = requireDb().from('restaurant_tables').select('*').eq('active', true);
      if (areaFilter) query = query.eq('area', areaFilter);
      return unwrapDb(await query).map(row => toTable(row))
        .sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || tableNumberValue(a) - tableNumberValue(b));
    },

    async requestOtp(input) {
      validateTimeRange(input.startTime, input.endTime);
      validateNotPast(input.bookingDate, input.startTime, now());
      if (input.numberOfGuests > MAX_ONLINE_GUESTS) throw bad('Online booking supports up to 6 guests. Please contact the restaurant for larger parties.');
      if (!mailer.configured) throw new HttpError(503, 'Online booking is temporarily unavailable. Please contact the restaurant.');
      validateTablesForBooking(await loadTables(input.tableIds), input.area, input.numberOfGuests);
      const otp = String(randomInt(1_000_000)).padStart(6, '0');
      const expiresAt = new Date(clock().getTime() + OTP_TTL_SECONDS * 1000).toISOString();
      const verificationId = randomUUID();
      const id = await save(null, {
        customer_name: input.customerName, customer_phone: input.customerPhone, customer_email: input.customerEmail,
        booking_date: input.bookingDate, start_time: input.startTime, end_time: input.endTime, number_of_guests: input.numberOfGuests,
        area: input.area, note: input.note, status: 'PENDING', email_verified: false, verification_id: verificationId,
        otp_hash: hashOtp(otp), otp_expires_at: expiresAt,
      }, input.tableIds, { tableRule: 'day', checkEmail: true });
      const booking = await loadBooking(id);
      try { await mailer.send('otp', booking, { otp }); }
      catch (error) {
        await requireDb().from('bookings').update({ status: 'CANCELLED' }).eq('id', id);
        logger.warn(JSON.stringify({ event: 'booking.otp_email_failed', bookingId: id, error: error.message }));
        throw new HttpError(502, 'We could not send the verification email. Please check the address and try again.');
      }
      return { bookingId: id, verificationId, email: booking.customerEmail, expiresAt };
    },

    async resendOtp({ verificationId }) {
      const row = unwrapDb(await requireDb().from('bookings').select('id, status, otp_resend_count').eq('verification_id', verificationId).eq('email_verified', false).maybeSingle());
      if (!row || row.status !== 'PENDING') throw bad('Verification session not found.');
      if (row.otp_resend_count >= MAX_OTP_RESENDS) throw bad('OTP resend limit reached.');
      const otp = String(randomInt(1_000_000)).padStart(6, '0');
      const expiresAt = new Date(clock().getTime() + OTP_TTL_SECONDS * 1000).toISOString();
      const nextId = randomUUID();
      // Re-check the hold: the previous OTP may have expired and released the tables.
      await transition(row.id, {}, { tableRule: 'day' });
      unwrapDb(await requireDb().from('bookings').update({
        verification_id: nextId, otp_hash: hashOtp(otp), otp_expires_at: expiresAt, otp_attempt_count: 0, otp_resend_count: row.otp_resend_count + 1,
      }).eq('id', row.id).eq('email_verified', false));
      const booking = await loadBooking(row.id);
      try { await mailer.send('otp', booking, { otp }); }
      catch { throw new HttpError(502, 'We could not send the verification email. Please try again.'); }
      return { bookingId: booking.id, verificationId: nextId, email: booking.customerEmail, expiresAt };
    },

    async verifyOtp({ verificationId, otp }) {
      const row = unwrapDb(await requireDb().from('bookings').select('id, status, otp_hash, otp_expires_at, otp_attempt_count').eq('verification_id', verificationId).eq('email_verified', false).maybeSingle());
      if (!row || row.status !== 'PENDING') throw bad('Invalid verification session.');
      if (!(Date.parse(row.otp_expires_at) > clock().getTime())) {
        await requireDb().from('bookings').update({ status: 'CANCELLED' }).eq('id', row.id);
        throw bad('OTP expired.');
      }
      if (row.otp_attempt_count >= MAX_OTP_ATTEMPTS) {
        await requireDb().from('bookings').update({ status: 'CANCELLED' }).eq('id', row.id);
        throw bad('OTP attempt limit reached.');
      }
      if (hashOtp(otp) !== row.otp_hash) {
        await requireDb().from('bookings').update({ otp_attempt_count: row.otp_attempt_count + 1 }).eq('id', row.id);
        throw bad('Invalid OTP.');
      }
      await transition(row.id, { email_verified: true, status: 'PENDING', otp_hash: null }, { tableRule: 'day', checkEmail: true });
      const booking = await loadBooking(row.id);
      const warning = await notify('pending', booking);
      changed(booking.id, true);
      return { ...booking, ...(warning ? { warning } : {}) };
    },

    booking: loadBooking,

    async list({ date: bookingDate, area: bookingArea }) {
      let query = requireDb().from('bookings').select(BOOKING_SELECT).eq('email_verified', true);
      if (bookingDate) query = query.eq('booking_date', bookingDate);
      if (bookingArea) query = query.eq('area', bookingArea);
      const rows = unwrapDb(await query.order('booking_date', { ascending: false }).order('start_time', { ascending: false }).limit(2000));
      return rows.map(toBooking);
    },

    async page(filters) {
      let query = requireDb().from('bookings').select(BOOKING_SELECT, { count: 'exact' }).eq('email_verified', true);
      if (filters.date) query = query.eq('booking_date', filters.date);
      if (filters.area) query = query.eq('area', filters.area);
      if (filters.status) query = query.eq('status', filters.status);
      if (filters.startTime) query = query.gt('end_time', filters.startTime);
      if (filters.endTime) query = query.lt('start_time', filters.endTime);
      if (filters.tableNumber) {
        const tables = unwrapDb(await requireDb().from('restaurant_tables').select('id').ilike('table_number', `%${filters.tableNumber.replace(/[%_\\]/g, '')}%`));
        const links = tables.length ? unwrapDb(await requireDb().from('booking_tables').select('booking_id').in('table_id', tables.map(table => table.id))) : [];
        query = query.in('id', links.length ? [...new Set(links.map(link => link.booking_id))] : [-1]);
      }
      // PostgREST `or` filters break on commas/parentheses, so strip them from free text.
      const term = filters.search?.replace(/[,()*%\\:"']/g, ' ').trim();
      if (term) query = query.or(['customer_name', 'customer_email', 'customer_phone'].map(column => `${column}.ilike.*${term}*`).join(','));
      const from = filters.page * filters.size;
      const { data, count, error } = await query.order('pending_rank').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + filters.size - 1);
      if (error) throw dbError(error);
      return { content: data.map(toBooking), page: filters.page, size: filters.size, totalElements: count || 0, totalPages: Math.ceil((count || 0) / filters.size) };
    },

    async pendingCount() {
      const { count, error } = await requireDb().from('bookings').select('id', { count: 'exact', head: true }).eq('email_verified', true).eq('status', 'PENDING');
      if (error) throw dbError(error);
      return { count: count || 0 };
    },

    async create(input) {
      validateTimeRange(input.startTime, input.endTime);
      validateTablesForBooking(await loadTables(input.tableIds), input.area, input.numberOfGuests);
      const id = await save(null, {
        customer_name: input.customerName, customer_phone: input.customerPhone || PLACEHOLDER_PHONE,
        customer_email: input.customerEmail || PLACEHOLDER_EMAIL, booking_date: input.bookingDate, start_time: input.startTime,
        end_time: input.endTime, number_of_guests: input.numberOfGuests, area: input.area, note: input.note,
        status: input.status || 'APPROVED', email_verified: true,
      }, input.tableIds, { tableRule: 'overlap', checkEmail: realEmail(input.customerEmail) });
      changed(id);
      return loadBooking(id);
    },

    async update(id, input) {
      validateTimeRange(input.startTime, input.endTime);
      const current = await loadBooking(id);
      validateTablesForBooking(await loadTables(input.tableIds), input.area, input.numberOfGuests);
      await save(id, {
        customer_name: input.customerName, customer_phone: input.customerPhone || current.customerPhone,
        customer_email: input.customerEmail || current.customerEmail, booking_date: input.bookingDate, start_time: input.startTime,
        end_time: input.endTime, number_of_guests: input.numberOfGuests, area: input.area, note: input.note, status: input.status || null,
      }, input.tableIds, { tableRule: 'overlap', checkEmail: realEmail(input.customerEmail) });
      const booking = await loadBooking(id);
      const sameTables = current.tables.map(table => table.id).sort().join() === [...new Set(input.tableIds)].sort().join();
      const moved = !sameTables || current.bookingDate !== booking.bookingDate || current.startTime !== booking.startTime || current.endTime !== booking.endTime;
      const warning = moved ? await notify('updated', booking) : undefined;
      changed(id);
      return { ...booking, ...(warning ? { warning } : {}) };
    },

    async approve(id) {
      await transition(id, { status: 'APPROVED', approved_at: clock().toISOString() }, { tableRule: 'overlap' });
      const booking = await loadBooking(id);
      const warning = await notify('approved', booking);
      changed(id);
      return { ...booking, ...(warning ? { warning } : {}) };
    },

    async reject(id, { reason }) {
      const row = unwrapDb(await requireDb().from('bookings').update({ status: 'REJECTED', rejected_at: clock().toISOString(), rejection_reason: reason }).eq('id', id).select('id').maybeSingle());
      if (!row) throw new HttpError(404, 'Booking not found.');
      const booking = await loadBooking(id);
      const warning = await notify('rejected', booking);
      changed(id);
      return { ...booking, ...(warning ? { warning } : {}) };
    },

    async cancel(id) {
      const current = await loadBooking(id);
      unwrapDb(await requireDb().from('bookings').update({ status: 'CANCELLED' }).eq('id', id));
      const booking = { ...current, status: 'CANCELLED' };
      const warning = await notify('cancelled', booking);
      changed(id);
      return { ...booking, ...(warning ? { warning } : {}) };
    },

    async createTable(input) {
      validateBounds(input);
      if (!EDITABLE_TABLE_STATUSES.includes(input.status)) throw bad('HOLD and RESERVED are booking-derived statuses and cannot be set manually.');
      return toTable(unwrapDb(await requireDb().from('restaurant_tables').insert(tableRow(input)).select().single()));
    },

    async updateTable(id, input) {
      validateBounds(input);
      if (!EDITABLE_TABLE_STATUSES.includes(input.status)) throw bad('HOLD and RESERVED are booking-derived statuses and cannot be set manually.');
      const row = unwrapDb(await requireDb().from('restaurant_tables').update(tableRow(input)).eq('id', id).select().maybeSingle());
      if (!row) throw new HttpError(404, 'Table not found.');
      return toTable(row);
    },

    async updateTablePosition(id, input) {
      validateBounds(input);
      const { x, y, width, height, rotation } = input;
      const row = unwrapDb(await requireDb().from('restaurant_tables').update({ x, y, width, height, rotation }).eq('id', id).select().maybeSingle());
      if (!row) throw new HttpError(404, 'Table not found.');
      return toTable(row);
    },

    async deleteTable(id) {
      // Tables are deactivated, never removed, so past bookings keep their table numbers.
      const row = unwrapDb(await requireDb().from('restaurant_tables').update({ active: false }).eq('id', id).select('id').maybeSingle());
      if (!row) throw new HttpError(404, 'Table not found.');
    },
  };
}
