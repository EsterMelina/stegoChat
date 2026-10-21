export type User = {
  id: number;
  username: string;
  display_name: string;
};

export type Chat = {
  id: number;
  kind: "direct" | "group";
  name: string | null;
  owner_id: number | null;
  members: User[];
  unread: number;
  last_message: {
    kind: string;
    body: string | null;
    created_at: string;
  } | null;
};

export type Message = {
  id: number;
  chat_id: number;
  sender_id: number;
  kind: "text" | "hidden";
  body: string | null;
  created_at: string;
  edited_at: string | null;
  username: string;
  display_name: string;
  can_reveal: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Same-origin path; Next.js rewrites /api to the backend server-side.
  const url = `/api${normalizedPath}`;

  try {
    response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Sem ligação ao servidor. Verifique a URL do backend e a ligação à rede.",
      0,
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (
      response.status === 404 &&
      (normalizedPath.startsWith("/auth/") || normalizedPath === "/health")
    ) {
      throw new ApiError(
        "A rota solicitada não foi encontrada no backend. Verifique a URL da API.",
        404,
      );
    }

    if ([502, 503, 504].includes(response.status)) {
      const detail = typeof data?.detail === "string" ? data.detail : null;
      throw new ApiError(
        detail || `Servi\u00e7o temporariamente indispon\u00edvel (HTTP ${response.status}).`,
        response.status,
      );
    }

    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : response.status === 422
          ? "Verifique os dados introduzidos e os limites dos campos."
          : "Não foi possível concluir o pedido. Tente novamente.";

    throw new ApiError(detail, response.status);
  }

  return data as T;
}

export function title(chat: Chat, me: number) {
  return chat.kind === "group"
    ? chat.name || "Grupo"
    : chat.members.find((member) => member.id !== me)?.display_name ||
        "Conversa";
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export type RegisterResponse = { message: string; debug_code?: string };
export type MessageResponse  = { message: string };
export type ForgotResponse   = { message: string; debug_token?: string; debug_email?: string };
