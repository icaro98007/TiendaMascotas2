import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    import bcrypt as _bcrypt
except Exception:
    _bcrypt = None

JWT_SECRET = os.getenv("JWT_SECRET", "super_secreto_petshop_2026_key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 12

security_scheme = HTTPBearer(auto_error=False)


def hash_password(plain_password: str) -> str:
    if _bcrypt is not None:
        try:
            salt = _bcrypt.gensalt()
            return _bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")
        except Exception:
            pass
    # Fallback criptográfico PBKDF2-HMAC-SHA256 (260,000 iteraciones)
    salt_hex = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", plain_password.encode("utf-8"), bytes.fromhex(salt_hex), 260000
    )
    return f"pbkdf2_sha256${salt_hex}${dk.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith("pbkdf2_sha256$"):
        try:
            _, salt_hex, hash_hex = hashed_password.split("$", 2)
            dk = hashlib.pbkdf2_hmac(
                "sha256",
                plain_password.encode("utf-8"),
                bytes.fromhex(salt_hex),
                260000,
            )
            return hmac.compare_digest(dk.hex(), hash_hex)
        except Exception:
            return False
    if _bcrypt is not None:
        try:
            return _bcrypt.checkpw(
                plain_password.encode("utf-8"), hashed_password.encode("utf-8")
            )
        except Exception:
            return False
    return False


def create_access_token(user_id: int, username: str, rol: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "rol": rol,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación no proporcionado",
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "id": int(payload["sub"]),
            "username": payload["username"],
            "rol": payload["rol"],
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token ha expirado, inicie sesión nuevamente",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
        )
