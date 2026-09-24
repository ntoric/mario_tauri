use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

const ITERATIONS: u32 = 100_000;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;

/// Hash a password using PBKDF2-SHA256 in the same string format as the Go
/// backend: "pbkdf2_sha256$<iterations>$<salt_hex>$<hash_hex>".
pub fn hash_password(password: &str) -> String {
    let mut salt = [0u8; SALT_LEN];
    rand::Rng::fill(&mut rand::thread_rng(), &mut salt);
    let mut out = [0u8; KEY_LEN];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, ITERATIONS, &mut out);
    format!(
        "pbkdf2_sha256${}${}${}",
        ITERATIONS,
        hex::encode(salt),
        hex::encode(out)
    )
}

/// Verify a password against a PBKDF2-SHA256 or legacy bcrypt hash.
pub fn verify_password(stored_hash: &str, password: &str) -> bool {
    if !stored_hash.starts_with("pbkdf2_sha256$") {
        // Legacy bcrypt verification (matches Go backend behaviour).
        return bcrypt::verify(password, stored_hash).unwrap_or(false);
    }

    let parts: Vec<&str> = stored_hash.split('$').collect();
    if parts.len() != 4 {
        return false;
    }
    let iterations: u32 = match parts[1].parse() {
        Ok(v) => v,
        Err(_) => return false,
    };
    let salt = match hex::decode(parts[2]) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let expected = match hex::decode(parts[3]) {
        Ok(v) => v,
        Err(_) => return false,
    };

    let mut derived = vec![0u8; expected.len()];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, iterations, &mut derived);
    subtle::ConstantTimeEq::ct_eq(derived.as_slice(), expected.as_slice()).into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub id: String,
    pub username: String,
    pub role: String,
    pub store_id: String,
    pub exp: i64,
    pub iat: i64,
}

type HmacSha256 = Hmac<Sha256>;

/// Generate an HS256 JWT token (24h expiry) — same shape as the Go backend.
pub fn generate_token(claims: &Claims, secret: &str) -> Result<String, String> {
    let header = serde_json::json!({"alg": "HS256", "typ": "JWT"});
    let payload = serde_json::to_value(claims).map_err(|e| e.to_string())?;

    let signing_input = format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(header.to_string()),
        URL_SAFE_NO_PAD.encode(payload.to_string())
    );

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).map_err(|e| e.to_string())?;
    mac.update(signing_input.as_bytes());
    let sig = mac.finalize().into_bytes();

    Ok(format!(
        "{}.{}",
        signing_input,
        URL_SAFE_NO_PAD.encode(sig)
    ))
}

/// Verify an HS256 JWT and return its claims if valid and not expired.
pub fn verify_token(token: &str, secret: &str) -> Option<Claims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    let signing_input = format!("{}.{}", parts[0], parts[1]);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).ok()?;
    mac.update(signing_input.as_bytes());
    let sig = URL_SAFE_NO_PAD.decode(parts[2]).ok()?;
    if mac.verify_slice(&sig).is_err() {
        return None;
    }

    let payload_bytes = URL_SAFE_NO_PAD.decode(parts[1]).ok()?;
    let claims: Claims = serde_json::from_slice(&payload_bytes).ok()?;

    if claims.exp < chrono::Utc::now().timestamp() {
        return None;
    }
    Some(claims)
}

pub fn new_claims(id: &str, username: &str, role: &str, store_id: &str) -> Claims {
    let now = chrono::Utc::now().timestamp();
    Claims {
        id: id.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        store_id: store_id.to_string(),
        // Long-lived local session — the user stays logged in until they
        // explicitly log out (the frontend discards the token on logout).
        exp: now + 365 * 24 * 3600,
        iat: now,
    }
}
