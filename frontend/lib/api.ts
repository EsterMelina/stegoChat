export type User = { id: number; username: string; display_name: string };
export type Chat = { id: number; kind: "direct" | "group"; name: string | null; owner_id: number | null; members: User[]; unread: number; last_message: { kind: string; body: string | null; created_at: string } | null };
export type Message = { id: number; chat_id: number; sender_id: number; kind: "text" | "hidden"; body: string | null; created_at: string; edited_at: string | null; username: string; display_name: string; can_reveal: boolean };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  } catch {
    throw new ApiError("Sem ligação ao servidor. Confirme que o backend está em execução.", 0);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 404 && (path.startsWith("/auth/") || path === "/health")) {
      throw new ApiError("A API do StegChat não foi encontrada. Confirme o backend na porta 8001 e reinicie o frontend conforme o README.", 404);
    }
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      throw new ApiError("Não foi possível contactar o backend do StegChat. Confirme que está em execução conforme o README.", response.status);
    }
    const detail = typeof data?.detail === "string" ? data.detail : response.status === 422 ? "Verifique os dados introduzidos e os limites dos campos." : "Não foi possível concluir o pedido. Tente novamente.";
    throw new ApiError(detail, response.status);
  }
  return data as T;
}

export function title(chat: Chat, me: number) {
  return chat.kind === "group" ? chat.name || "Grupo" : chat.members.find(member => member.id !== me)?.display_name || "Conversa";
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
