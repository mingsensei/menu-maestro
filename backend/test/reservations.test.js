import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { bestTableGroup, createReservations, dbError, restaurantNow, schemas, suggestionAreas, validateTablesForBooking } from '../src/reservations.js';
import { renderBookingEmail } from '../src/mailer.js';
import { handleAdminReservations, handlePublicReservations } from '../src/reservation-routes.js';

const table = (id, number, area = 'TERRACE', extra = {}) => ({ id, tableNumber: number, area, capacity: 2, status: 'AVAILABLE', active: true, ...extra });
const terrace = Array.from({ length: 12 }, (_, index) => table(index + 1, `T${index + 1}`));
const verona = Array.from({ length: 16 }, (_, index) => table(100 + index, `V${index + 1}`, 'VERONA'));

test('table selection follows the RTR joining rules', () => {
  assert.doesNotThrow(() => validateTablesForBooking([terrace[0]], 'TERRACE', 2));
  assert.doesNotThrow(() => validateTablesForBooking([terrace[1], terrace[2]], 'TERRACE', 4));
  assert.throws(() => validateTablesForBooking([terrace[0], terrace[1]], 'TERRACE', 2), /only one table/);
  assert.throws(() => validateTablesForBooking([terrace[0], terrace[2]], 'TERRACE', 4), /adjacent/);
  assert.throws(() => validateTablesForBooking([terrace[5], terrace[6]], 'TERRACE', 4), /T6 and T7/);
  assert.throws(() => validateTablesForBooking([terrace[0]], 'TERRACE', 3), /not enough/);
  assert.throws(() => validateTablesForBooking([terrace[0], terrace[1], terrace[2], terrace[3]], 'TERRACE', 6), /between 1 and 3/);
  assert.throws(() => validateTablesForBooking([verona[0]], 'VERONA', 2), /Verona/);
  assert.doesNotThrow(() => validateTablesForBooking([verona[10], verona[11]], 'VERONA', 3));
  assert.throws(() => validateTablesForBooking([verona[11], verona[12]], 'VERONA', 4), /fixed pairs/);
  assert.throws(() => validateTablesForBooking([{ ...terrace[0], status: 'MAINTENANCE' }], 'TERRACE', 2), error => error.code === 'TABLE_NOT_AVAILABLE');
});

test('best table suggestion prefers central adjacent tables and Verona pairs', () => {
  assert.deepEqual(suggestionAreas('outside', 4), ['TERRACE']);
  assert.deepEqual(suggestionAreas('inside', 2), ['ROMA']);
  assert.deepEqual(suggestionAreas('inside', 5), ['VERONA', 'ROMA']);
  assert.deepEqual(bestTableGroup('TERRACE', terrace, 2).map(item => item.tableNumber), ['T6']);
  // T6+T7 may not be joined, so the closest legal pair wins.
  assert.deepEqual(bestTableGroup('TERRACE', terrace, 4).map(item => item.tableNumber), ['T5', 'T6']);
  assert.deepEqual(bestTableGroup('VERONA', verona, 4).map(item => item.tableNumber), ['V11', 'V12']);
  assert.deepEqual(bestTableGroup('VERONA', verona.filter(item => item.id < 110), 6).map(item => item.tableNumber), ['V8', 'V9', 'V10']);
  assert.deepEqual(bestTableGroup('TERRACE', [terrace[0], terrace[2]], 4), []);
});

test('restaurant time uses the configured zone and query validation trims seconds', () => {
  assert.deepEqual(restaurantNow('Asia/Ho_Chi_Minh', new Date('2026-11-15T17:30:00Z')), { date: '2026-11-16', time: '00:30' });
  assert.equal(schemas.availability.parse({ area: 'ROMA', date: '2026-11-20', startTime: '18:00:00', endTime: '20:00' }).startTime, '18:00');
  assert.throws(() => schemas.requestOtp.parse({ customerName: 'A', customerPhone: 'x', customerEmail: 'bad', bookingDate: '2026-11-20', startTime: '18:00', endTime: '20:00', numberOfGuests: 2, area: 'ROMA', tableIds: [1] }));
});

test('database exceptions keep their reservation error codes', () => {
  const error = dbError({ message: 'TABLE_NOT_AVAILABLE: The selected table is no longer available.' });
  assert.equal(error.status, 409);
  assert.equal(error.code, 'TABLE_NOT_AVAILABLE');
  assert.equal(dbError({ message: 'EMAIL_ALREADY_BOOKED_TODAY: dup' }).code, 'EMAIL_ALREADY_BOOKED_TODAY');
  assert.equal(dbError({ message: 'connection reset' }).status, 502);
});

test('booking emails escape guest input', () => {
  const booking = { bookingCode: 'RTR-1', status: 'PENDING', area: 'ROMA', tables: [{ tableNumber: 'R1' }], bookingDate: '2026-11-20', startTime: '18:00', endTime: '20:00', numberOfGuests: 2, customerPhone: '0900', customerEmail: 'a@b.co', customerName: '<script>x</script>', note: null };
  const { subject, html } = renderBookingEmail('otp', booking, { otp: '123456' });
  assert.match(subject, /verification/);
  assert.match(html, /123456/);
  assert.doesNotMatch(html, /<script>/);
});

// ---------- in-memory Supabase double for the service flow ----------
function fakeDb(now) {
  const data = {
    restaurant_tables: Array.from({ length: 12 }, (_, index) => ({ id: index + 1, table_number: `T${index + 1}`, area: 'TERRACE', capacity: 2, status: 'AVAILABLE', x: 0, y: 0, width: 96, height: 72, rotation: 0, shape: 'RECTANGLE', active: true })),
    bookings: [], booking_tables: [],
  };
  let nextId = 1;
  const embed = row => ({ ...row, booking_tables: data.booking_tables.filter(link => link.booking_id === row.id).map(link => ({ table_id: link.table_id, table: data.restaurant_tables.find(item => item.id === link.table_id) })) });
  const assertAvailable = (id, date, start, end, tableIds, email, rule, checkEmail) => {
    const blocking = data.bookings.filter(item => item.booking_date === date && ['PENDING', 'APPROVED'].includes(item.status) && item.id !== id && (item.email_verified || Date.parse(item.otp_expires_at) > now()) && (rule === 'day' || (item.start_time < end && item.end_time > start)));
    if (rule !== 'none' && blocking.some(item => data.booking_tables.some(link => link.booking_id === item.id && tableIds.includes(link.table_id)))) return { message: 'TABLE_NOT_AVAILABLE: The selected table is no longer available.' };
    if (checkEmail && data.bookings.some(item => item.customer_email === email && item.booking_date === date && item.email_verified && item.id !== id)) return { message: 'EMAIL_ALREADY_BOOKED_TODAY: taken' };
    return null;
  };
  return {
    data,
    async rpc(name, args) {
      if (name === 'booking_save') {
        const error = assertAvailable(args.p_id, args.p_data.booking_date, args.p_data.start_time, args.p_data.end_time, args.p_table_ids, args.p_data.customer_email, args.p_table_rule, args.p_check_email);
        if (error) return { data: null, error };
        let id = args.p_id;
        if (!id) { id = nextId++; data.bookings.push({ id, otp_attempt_count: 0, otp_resend_count: 0, created_at: new Date(now()).toISOString(), ...args.p_data }); }
        else Object.assign(data.bookings.find(item => item.id === id), args.p_data, { status: args.p_data.status ?? data.bookings.find(item => item.id === id).status });
        data.booking_tables = data.booking_tables.filter(link => link.booking_id !== id).concat(args.p_table_ids.map(tableId => ({ booking_id: id, table_id: tableId })));
        return { data: id, error: null };
      }
      if (name === 'booking_transition') {
        const row = data.bookings.find(item => item.id === args.p_id);
        const ids = data.booking_tables.filter(link => link.booking_id === row.id).map(link => link.table_id);
        const error = assertAvailable(row.id, row.booking_date, row.start_time, row.end_time, ids, row.customer_email, args.p_table_rule, args.p_check_email);
        if (error) return { data: null, error };
        Object.assign(row, args.p_data);
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
    from(name) {
      let rows = data[name].map(row => (name === 'bookings' ? embed(row) : { ...row }));
      let patch; let head = false; let count;
      const query = {
        select(_columns, options = {}) { head = Boolean(options.head); if (options.count) count = true; return query; },
        update(values) { patch = values; return query; },
        insert(values) { const row = { id: 1000 + data[name].length, ...values }; data[name].push(row); rows = [row]; return query; },
        eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
        in(key, values) { rows = rows.filter(row => values.includes(row[key])); return query; },
        gt(key, value) { rows = rows.filter(row => row[key] > value); return query; },
        lt(key, value) { rows = rows.filter(row => row[key] < value); return query; },
        ilike() { return query; }, or() { return query; }, order() { return query; }, limit() { return query; },
        range(from, to) { query.total = rows.length; rows = rows.slice(from, to + 1); return query; },
        maybeSingle() { return query.then(result => ({ ...result, data: result.data[0] ?? null })); },
        single() { return query.then(result => ({ ...result, data: result.data[0] })); },
        then(resolve, reject) {
          if (patch) for (const row of rows) Object.assign(data[name].find(item => item.id === row.id), patch);
          const result = rows.map(row => (patch ? { ...row, ...patch } : row));
          return Promise.resolve({ data: head ? null : result, count: count ? (query.total ?? rows.length) : undefined, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function service() {
  let time = Date.parse('2026-11-15T03:00:00Z');
  const sent = [];
  const db = fakeDb(() => time);
  const reservations = createReservations({
    db, clock: () => new Date(time), logger: { warn() {}, info() {} },
    mailer: { configured: true, send: async (kind, booking, extra) => { sent.push({ kind, to: booking.customerEmail, ...extra }); } },
  });
  return { db, sent, reservations, advance: ms => { time += ms; } };
}
const guest = { customerName: 'Lan', customerPhone: '0900 000 000', customerEmail: 'lan@example.com', bookingDate: '2026-11-20', startTime: '18:00', endTime: '20:00', numberOfGuests: 2, area: 'TERRACE', note: null, tableIds: [3] };

test('guest booking holds the table, verifies by OTP and notifies admins', async () => {
  const { reservations, sent } = service();
  const events = [];
  reservations.events.on('booking.changed', event => events.push(event));
  const session = await reservations.requestOtp(guest);
  assert.equal(sent[0].kind, 'otp');
  const tables = await reservations.availability({ area: 'TERRACE', date: '2026-11-20', startTime: '18:00', endTime: '20:00' });
  assert.equal(tables.find(item => item.id === 3).status, 'HOLD');
  await assert.rejects(reservations.requestOtp({ ...guest, customerEmail: 'other@example.com' }), error => error.code === 'TABLE_NOT_AVAILABLE');
  await assert.rejects(reservations.verifyOtp({ verificationId: session.verificationId, otp: sent[0].otp === '000000' ? '000001' : '000000' }), /Invalid OTP/);
  const booking = await reservations.verifyOtp({ verificationId: session.verificationId, otp: sent[0].otp });
  assert.equal(booking.status, 'PENDING');
  assert.equal(booking.emailVerified, true);
  assert.deepEqual(booking.tables.map(item => item.tableNumber), ['T3']);
  assert.deepEqual(events, [{ bookingId: booking.id, newCustomerBooking: true }]);
  assert.equal(sent.at(-1).kind, 'pending');
  assert.deepEqual(await reservations.pendingCount(), { count: 1 });
  const approved = await reservations.approve(booking.id);
  assert.equal(approved.status, 'APPROVED');
  const after = await reservations.availability({ area: 'TERRACE', date: '2026-11-20', startTime: '18:00', endTime: '20:00' });
  assert.equal(after.find(item => item.id === 3).status, 'RESERVED');
  await assert.rejects(reservations.requestOtp({ ...guest, tableIds: [4] }), error => error.code === 'EMAIL_ALREADY_BOOKED_TODAY');
});

test('expired OTP releases the table and cannot be verified', async () => {
  const { reservations, sent, advance } = service();
  const session = await reservations.requestOtp(guest);
  advance(121000);
  const tables = await reservations.availability({ area: 'TERRACE', date: '2026-11-20', startTime: '18:00', endTime: '20:00' });
  assert.equal(tables.find(item => item.id === 3).status, 'AVAILABLE');
  await assert.rejects(reservations.verifyOtp({ verificationId: session.verificationId, otp: sent[0].otp }), /expired/);
});

test('past bookings and large online parties are refused', async () => {
  const { reservations } = service();
  await assert.rejects(reservations.requestOtp({ ...guest, bookingDate: '2026-11-14' }), /past/);
  await assert.rejects(reservations.requestOtp({ ...guest, numberOfGuests: 7 }), /up to 6 guests/);
});

test('routes expose guest endpoints and keep management behind the admin handler', async () => {
  const { reservations } = service();
  const send = (res, body, status = 200) => { res.status = status; res.body = body; };
  const call = async (handler, method, path, body) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    Object.assign(req, { method, headers: { 'content-type': 'application/json' } });
    const res = {};
    const readBody = async () => body;
    const url = new URL(path, 'http://x');
    const handled = await handler({ req, res, method, path: url.pathname, url, ip: '1', limit: () => {}, send, readBody, service: reservations });
    return { handled, ...res };
  };
  const tables = await call(handlePublicReservations, 'GET', '/api/reservations/tables?area=TERRACE');
  assert.equal(tables.body.length, 12);
  assert.equal((await call(handlePublicReservations, 'GET', '/api/admin/bookings')).handled, false);
  const created = await call(handleAdminReservations, 'POST', '/api/admin/bookings', { customerName: 'Walk in', numberOfGuests: 2, bookingDate: '2026-11-20', startTime: '19:00', endTime: '21:00', area: 'TERRACE', tableIds: [5] });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'APPROVED');
  const page = await call(handleAdminReservations, 'GET', '/api/admin/bookings/page?page=0&size=10&status=');
  assert.equal(page.body.totalElements, 1);
  const cancelled = await call(handleAdminReservations, 'DELETE', `/api/admin/bookings/${created.body.id}`);
  assert.equal(cancelled.body.status, 'CANCELLED');
  await assert.rejects(call(handleAdminReservations, 'POST', '/api/admin/tables', { tableNumber: 'T99', area: 'TERRACE', capacity: 2, status: 'HOLD', x: 0, y: 0, width: 10, height: 10 }), /booking-derived/);
});

test('guests get one booking per table per day; admins only need non-overlapping times', async () => {
  const { reservations } = service();
  const admin = { customerName: 'Rogers', numberOfGuests: 2, bookingDate: '2026-11-20', startTime: '18:30', endTime: '20:00', area: 'TERRACE', tableIds: [4], note: null };
  const first = await reservations.create(admin);
  // Admin: back-to-back seating on the same table is allowed, overlapping is not.
  const second = await reservations.create({ ...admin, customerName: 'Audrey', startTime: '20:00', endTime: '22:00' });
  await assert.rejects(reservations.create({ ...admin, customerName: 'Late', startTime: '19:30', endTime: '21:00' }), error => error.code === 'TABLE_NOT_AVAILABLE');
  // Editing one seating is not blocked by the other one that day.
  const moved = await reservations.update(second.id, { ...admin, customerName: 'Audrey', startTime: '20:15', endTime: '22:00', status: null });
  assert.equal(moved.startTime, '20:15');
  await assert.rejects(reservations.update(first.id, { ...admin, endTime: '20:30', status: null }), error => error.code === 'TABLE_NOT_AVAILABLE');
  // Guests see the table as taken for the whole day and cannot request it, even at a free time.
  const tables = await reservations.availability({ area: 'TERRACE', date: '2026-11-20', startTime: '22:00', endTime: '23:00' });
  assert.equal(tables.find(item => item.id === 4).status, 'RESERVED');
  await assert.rejects(reservations.requestOtp({ ...guest, startTime: '22:00', endTime: '23:00', tableIds: [4] }), error => error.code === 'TABLE_NOT_AVAILABLE');
});
