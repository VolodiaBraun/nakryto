const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('accessToken')
    : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Попытка refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${localStorage.getItem('accessToken')}`;
      const retry = await fetch(`${API_URL}${path}`, { ...options, headers });
      if (!retry.ok) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        throw new ApiError(401, 'Unauthorized');
      }
      const data = await retry.json();
      return data.data ?? data;
    } else {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      throw new ApiError(401, 'Unauthorized');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || err?.message || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, err);
  }

  if (res.status === 204) return null as T;

  const json = await res.json();
  return json.data ?? json;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const json = await res.json();
    const data = json.data ?? json;
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: any) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  login: (data: any) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  me: () => request('/api/auth/me'),

  logout: () => request('/api/auth/logout', { method: 'POST' }),

  resendVerification: () =>
    request('/api/auth/resend-verification', { method: 'POST' }),

  forgotPassword: (email: string) =>
    request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (token: string, password: string) =>
    request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
};

export const restaurantApi = {
  getProfile: () => request('/api/restaurant/profile'),

  updateProfile: (data: any) =>
    request('/api/restaurant/profile', { method: 'PUT', body: JSON.stringify(data) }),

  updateSettings: (data: any) =>
    request('/api/restaurant/settings', { method: 'PUT', body: JSON.stringify(data) }),

  updateWorkingHours: (data: any) =>
    request('/api/restaurant/working-hours', { method: 'PUT', body: JSON.stringify(data) }),

  getStats: () => request('/api/restaurant/stats'),

  getWidgetSettings: () => request('/api/restaurant/widget-settings'),

  updateWidgetSettings: (data: any) =>
    request('/api/restaurant/widget-settings', { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── Halls ────────────────────────────────────────────────────────────────────

export const hallsApi = {
  getAll: () => request('/api/restaurant/halls'),

  getOne: (id: string) => request(`/api/restaurant/halls/${id}`),

  getTemplates: () => request('/api/restaurant/halls/templates'),

  create: (data: any) =>
    request('/api/restaurant/halls', { method: 'POST', body: JSON.stringify(data) }),

  createFromTemplate: (templateKey: string) =>
    request(`/api/restaurant/halls/from-template/${templateKey}`, { method: 'POST' }),

  update: (id: string, data: any) =>
    request(`/api/restaurant/halls/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  saveFloorPlan: (id: string, floorPlan: any) =>
    request(`/api/restaurant/halls/${id}/floor-plan`, {
      method: 'PUT',
      body: JSON.stringify({ floorPlan }),
    }),

  delete: (id: string) =>
    request(`/api/restaurant/halls/${id}`, { method: 'DELETE' }),
};

// ─── Tables ───────────────────────────────────────────────────────────────────

export const tablesApi = {
  getAll: (hallId?: string) =>
    request(`/api/restaurant/tables${hallId ? `?hallId=${hallId}` : ''}`),

  getOne: (id: string) => request(`/api/restaurant/tables/${id}`),

  create: (data: any) =>
    request('/api/restaurant/tables', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: any) =>
    request(`/api/restaurant/tables/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  bulkUpdatePositions: (updates: any[]) =>
    request('/api/restaurant/tables/bulk-positions', {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    }),

  delete: (id: string) =>
    request(`/api/restaurant/tables/${id}`, { method: 'DELETE' }),
};

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookingsApi = {
  getAll: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request(`/api/restaurant/bookings${qs}`);
  },

  getOne: (id: string) => request(`/api/restaurant/bookings/${id}`),

  create: (data: any) =>
    request('/api/restaurant/bookings', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: any) =>
    request(`/api/restaurant/bookings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: string, data: any) =>
    request(`/api/restaurant/bookings/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ─── Closed Periods ───────────────────────────────────────────────────────────

export const closedPeriodsApi = {
  getAll: () => request('/api/restaurant/closed-periods'),

  create: (data: any) =>
    request('/api/restaurant/closed-periods', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/api/restaurant/closed-periods/${id}`, { method: 'DELETE' }),
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const publicApi = {
  getRestaurant: (slug: string) => request(`/api/public/${slug}`),

  getHalls: (slug: string) => request(`/api/public/${slug}/halls`),

  getAvailability: (slug: string, date: string, guests: number) =>
    request(`/api/public/${slug}/availability?date=${date}&guests=${guests}`),

  getTableStatuses: (slug: string, date: string, time?: string) =>
    request(`/api/public/${slug}/tables/status?date=${date}${time ? `&time=${time}` : ''}`),

  lockTable: (slug: string, tableId: string, date: string, lockId: string) =>
    request(`/api/public/${slug}/tables/${tableId}/lock`, {
      method: 'POST',
      body: JSON.stringify({ date, lockId }),
    }),

  unlockTable: (slug: string, tableId: string, date: string, lockId: string) =>
    request(`/api/public/${slug}/tables/${tableId}/lock?date=${date}&lockId=${lockId}`, {
      method: 'DELETE',
    }),

  createBooking: (slug: string, data: any) =>
    request(`/api/public/${slug}/bookings`, { method: 'POST', body: JSON.stringify(data) }),

  getBookingByToken: (token: string) => request(`/api/public/bookings/${token}`),

  cancelBooking: (token: string) =>
    request(`/api/public/bookings/${token}`, { method: 'DELETE' }),
};

// ─── Staff ────────────────────────────────────────────────────────────────────

export const staffApi = {
  getAll: () => request('/api/restaurant/staff'),

  create: (data: { name: string; email: string; password: string; role: string }) =>
    request('/api/restaurant/staff', { method: 'POST', body: JSON.stringify(data) }),

  updateRole: (id: string, role: string) =>
    request(`/api/restaurant/staff/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),

  remove: (id: string) =>
    request(`/api/restaurant/staff/${id}`, { method: 'DELETE' }),
};

// ─── SuperAdmin API ───────────────────────────────────────────────────────────

async function superadminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('superadminToken')
    : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err?.error?.message || err?.message || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, err);
  }

  if (res.status === 204) return null as T;
  const json = await res.json();
  return json.data ?? json;
}

export const superadminApi = {
  login: (data: { email: string; password: string }) =>
    superadminRequest('/api/superadmin/auth/login', { method: 'POST', body: JSON.stringify(data) }),

  getRestaurants: (params?: { page?: number; limit?: number; search?: string }) => {
    const qs = params ? '?' + new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    ).toString() : '';
    return superadminRequest(`/api/superadmin/restaurants${qs}`);
  },

  updatePlan: (id: string, plan: string) =>
    superadminRequest(`/api/superadmin/restaurants/${id}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan }),
    }),

  getStats: () => superadminRequest('/api/superadmin/stats'),
};

export { ApiError };
