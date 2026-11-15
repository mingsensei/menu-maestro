import { z } from 'zod';
import { fromQuery, schemas } from './reservations.js';

const idParam = value => z.coerce.number().int().positive().parse(value);

/** Guest booking endpoints. Returns true when the request was handled. */
export async function handlePublicReservations({ req, res, method, path, url, ip, limit, send, readBody, service }) {
  if (!path.startsWith('/api/reservations/')) return false;
  const query = () => fromQuery(url.searchParams);
  if (method === 'GET' && path === '/api/reservations/tables') {
    const area = url.searchParams.get('area');
    send(res, await service.tables(area ? schemas.availability.shape.area.parse(area) : undefined));
    return true;
  }
  if (method === 'GET' && path === '/api/reservations/availability') {
    limit(`availability:${ip}`, 90);
    send(res, await service.availability(schemas.availability.parse(query())));
    return true;
  }
  if (method === 'GET' && path === '/api/reservations/suggest') {
    limit(`availability:${ip}`, 90);
    send(res, await service.suggest(schemas.suggest.parse(query())));
    return true;
  }
  if (method === 'POST' && path === '/api/reservations/request-otp') {
    limit(`booking-otp:${ip}`, 5);
    limit(`booking-otp-hour:${ip}`, 20, 3600000);
    send(res, await service.requestOtp(schemas.requestOtp.parse(await readBody(req))), 201);
    return true;
  }
  if (method === 'POST' && path === '/api/reservations/resend-otp') {
    limit(`booking-otp:${ip}`, 5);
    limit(`booking-otp-hour:${ip}`, 20, 3600000);
    send(res, await service.resendOtp(schemas.resendOtp.parse(await readBody(req))));
    return true;
  }
  if (method === 'POST' && path === '/api/reservations/verify-otp') {
    limit(`booking-verify:${ip}`, 10);
    send(res, await service.verifyOtp(schemas.verifyOtp.parse(await readBody(req))));
    return true;
  }
  return false;
}

/** Admin booking and table management. Call only after the admin session is verified. */
export async function handleAdminReservations({ req, res, method, path, url, send, readBody, service }) {
  if (!path.startsWith('/api/admin/bookings') && !path.startsWith('/api/admin/tables')) return false;
  const query = () => fromQuery(url.searchParams);

  if (method === 'GET' && path === '/api/admin/bookings/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('event: connected\ndata: ok\n\n');
    const listener = event => res.write(`event: booking.changed\ndata: ${JSON.stringify({ type: 'booking.changed', ...event })}\n\n`);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    service.events.on('booking.changed', listener);
    req.on('close', () => { clearInterval(heartbeat); service.events.off('booking.changed', listener); });
    return true;
  }
  if (method === 'GET' && path === '/api/admin/bookings') {
    const { date, area } = schemas.search.pick({ date: true, area: true }).parse(query());
    send(res, await service.list({ date, area }));
    return true;
  }
  if (method === 'GET' && path === '/api/admin/bookings/page') { send(res, await service.page(schemas.search.parse(query()))); return true; }
  if (method === 'GET' && path === '/api/admin/bookings/pending-count') { send(res, await service.pendingCount()); return true; }
  if (method === 'POST' && path === '/api/admin/bookings') { send(res, await service.create(schemas.adminBooking.parse(await readBody(req))), 201); return true; }

  const action = path.match(/^\/api\/admin\/bookings\/([^/]+)\/(approve|reject|cancel)$/);
  if (method === 'PATCH' && action) {
    const id = idParam(action[1]);
    if (action[2] === 'approve') send(res, await service.approve(id));
    else if (action[2] === 'reject') send(res, await service.reject(id, schemas.reject.parse(await readBody(req))));
    else send(res, await service.cancel(id));
    return true;
  }
  const booking = path.match(/^\/api\/admin\/bookings\/([^/]+)$/);
  if (booking && method === 'GET') { send(res, await service.booking(idParam(booking[1]))); return true; }
  if (booking && method === 'PATCH') { send(res, await service.update(idParam(booking[1]), schemas.adminBooking.parse(await readBody(req)))); return true; }
  // RTR "delete" cancels the booking so it remains in history.
  if (booking && method === 'DELETE') { send(res, await service.cancel(idParam(booking[1]))); return true; }

  if (method === 'GET' && path === '/api/admin/tables') {
    const area = url.searchParams.get('area');
    send(res, await service.tables(area ? schemas.table.shape.area.parse(area) : undefined));
    return true;
  }
  if (method === 'POST' && path === '/api/admin/tables') { send(res, await service.createTable(schemas.table.parse(await readBody(req))), 201); return true; }
  const position = path.match(/^\/api\/admin\/tables\/([^/]+)\/position$/);
  if (method === 'PATCH' && position) { send(res, await service.updateTablePosition(idParam(position[1]), schemas.position.parse(await readBody(req)))); return true; }
  const table = path.match(/^\/api\/admin\/tables\/([^/]+)$/);
  if (table && method === 'PATCH') { send(res, await service.updateTable(idParam(table[1]), schemas.table.parse(await readBody(req)))); return true; }
  if (table && method === 'DELETE') { await service.deleteTable(idParam(table[1])); send(res, { ok: true }); return true; }
  return false;
}
