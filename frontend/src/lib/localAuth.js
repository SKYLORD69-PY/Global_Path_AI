const USERS_KEY = "globalpath.localAuth.users";
const SESSION_KEY = "globalpath.localAuth.session";

const canUseStorage = typeof window !== "undefined" && Boolean(window.localStorage);

export const localAuthEnabled =
  import.meta.env.DEV || import.meta.env.VITE_APP_ENV === "development";

function readJson(key, fallback) {
  if (!canUseStorage) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!canUseStorage) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildUser(record) {
  return {
    id: record.id,
    email: record.email,
    aud: "authenticated",
    app_metadata: { provider: "local-dev" },
    user_metadata: {
      full_name: record.fullName || "",
    },
    created_at: record.createdAt,
  };
}

function buildSession(record) {
  return {
    access_token: `local-dev-${record.id}`,
    refresh_token: "",
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    user: buildUser(record),
  };
}

function getUsers() {
  return readJson(USERS_KEY, []);
}

function saveUsers(users) {
  writeJson(USERS_KEY, users);
}

export function getLocalSession() {
  const record = readJson(SESSION_KEY, null);
  if (!record?.id || !record?.email) return null;
  return buildSession(record);
}

export async function signUpLocal(email, password, options = {}) {
  const normalisedEmail = normaliseEmail(email);
  const users = getUsers();

  const existing = users.find((user) => user.email === normalisedEmail);
  if (existing) {
    return { error: new Error("User already registered"), confirmationRequired: false };
  }

  const record = {
    id: crypto.randomUUID(),
    email: normalisedEmail,
    password: String(password || ""),
    fullName: String(options.fullName || "").trim(),
    createdAt: new Date().toISOString(),
  };

  users.push(record);
  saveUsers(users);
  writeJson(SESSION_KEY, record);

  return {
    error: null,
    confirmationRequired: false,
    session: buildSession(record),
  };
}

export async function signInLocal(email, password) {
  const normalisedEmail = normaliseEmail(email);
  const users = getUsers();

  const record = users.find(
    (user) => user.email === normalisedEmail && user.password === String(password || "")
  );

  if (!record) {
    return { error: new Error("Invalid login credentials"), session: null };
  }

  writeJson(SESSION_KEY, record);
  return { error: null, session: buildSession(record) };
}

export async function signOutLocal() {
  if (!canUseStorage) return;
  window.localStorage.removeItem(SESSION_KEY);
}
