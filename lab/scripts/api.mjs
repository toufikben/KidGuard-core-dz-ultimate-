import { circleArea, polylineArea } from '../sink/lib/geo.mjs';

export class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body.slice(0, 400)}`);
    this.status = status;
    this.body = body;
  }
}

export function buildUserPayload({ name, email, password }) {
  return { name, email, password };
}

// groupId محذوف: لا توجد مجموعة بالمعمل، والجهاز بلا مجموعة يُسنَد لقائمة المستخدم
// (deviation #4 — انظر تقرير المهمة: POST بـ groupId:1 يُرجع 400 FK على TC_GROUPS)
export function buildDevicePayload({ name, uniqueId }) {
  return { name, uniqueId };
}

export function buildCircleGeofencePayload({ name, lat, lon, radiusMeters }) {
  return { name, area: circleArea(lat, lon, radiusMeters) };
}

// منطقة مسار = LINESTRING + polylineDistance، لا دائرة كبيرة واحدة (spec 6)
export function buildRouteGeofencePayload({ name, points, bufferMeters }) {
  const { area, attributes } = polylineArea(points, bufferMeters);
  return { name, area, attributes };
}

export function buildNotificationPayload({ type, notificators, always = false, description }) {
  return { type, notificators, always, ...(description ? { description } : {}) };
}

// الإذن خريطة من مفتاحين رقميين فقط، والاتجاه = الترتيب (المالك ثم الخاصية): Permission.java:54-66
export function buildPermissionPayload(ownerKey, ownerId, propertyKey, propertyId) {
  if (!/Id$/.test(ownerKey) || !/Id$/.test(propertyKey)) {
    throw new Error('permission keys must end with Id (userId/deviceId/geofenceId/notificationId)');
  }
  if (ownerKey === propertyKey) throw new Error('permission needs two distinct keys');
  return { [ownerKey]: ownerId, [propertyKey]: propertyId };
}

export function createApiClient({ baseUrl, email, password }) {
  const basic = 'Basic ' + Buffer.from(`${email}:${password}`).toString('base64');

  async function request(method, path, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: basic, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, text);
    if (text === '') return null;
    return JSON.parse(text);
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    remove: (path) => request('DELETE', path),
  };
}
