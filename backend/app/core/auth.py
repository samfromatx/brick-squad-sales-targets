import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwk, jwt

from app.core.config import settings

_bearer = HTTPBearer()
_jwks_cache: list | None = None


async def _get_public_keys() -> list:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
                timeout=10,
            )
            r.raise_for_status()
            _jwks_cache = r.json().get("keys", [])
    return _jwks_cache


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> str:
    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    alg = header.get("alg", "HS256")

    try:
        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            keys = await _get_public_keys()
            kid = header.get("kid")
            key_data = next((k for k in keys if k.get("kid") == kid), None)
            if key_data is None:
                key_data = keys[0] if keys else None
            if key_data is None:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No matching key")
            public_key = jwk.construct(key_data)
            payload = jwt.decode(
                token,
                public_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )

        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user_id

    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
