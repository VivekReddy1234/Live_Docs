let accessToken: string | null = localStorage.getItem('livedocs_access_token');
const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function getApiUrl(endpoint: string): string {
  return `${API_BASE_URL}${endpoint}`;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) {
    localStorage.setItem('livedocs_access_token', token);
  } else {
    localStorage.removeItem('livedocs_access_token');
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { requiresAuth = true, headers = {}, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
  };

  if (requiresAuth && accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const requestUrl = getApiUrl(endpoint);

  let response = await fetch(requestUrl, {
    ...rest,
    headers: requestHeaders,
    credentials: 'include', // includes httpOnly cookies for refresh token
  });

  // Handle token expiration & automatic refresh
  if (response.status === 401 && requiresAuth) {
    try {
      const refreshResponse = await fetch(getApiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        setAccessToken(refreshData.accessToken);

        // Retry original request with new token
        requestHeaders['Authorization'] = `Bearer ${refreshData.accessToken}`;
        response = await fetch(requestUrl, {
          ...rest,
          headers: requestHeaders,
          credentials: 'include',
        });
      } else {
        setAccessToken(null);
        window.dispatchEvent(new CustomEvent('livedocs:unauthorized'));
      }
    } catch {
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent('livedocs:unauthorized'));
    }
  }

  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = response.statusText;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}
