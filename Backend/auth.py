# auth.py - módulo de autenticación y autorización para AirSystem IA

import hashlib
import os
from functools import wraps
from flask import session, jsonify, request

# ── Base de datos local de usuarios ─────────────────────────────
# En producción reemplazar por SQLite/PostgreSQL con bcrypt.
# La contraseña se almacena como SHA-256(salt + password).

def _hash(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

SALT = os.environ.get("AUTH_SALT", "airsystem_salt_2024")

USUARIOS = {
    "admin": {
        "password_hash": _hash("admin123", SALT),
        "rol":           "admin",
        "nombre":        "Administrador",
    },
    "user1": {
        "password_hash": _hash("user123", SALT),
        "rol":           "viewer",
        "nombre":        "Usuario Viewer",
    },
}

# ── Helpers de sesión ────────────────────────────────────────────

def login_usuario(username: str, password: str) -> dict | None:
    """Valida credenciales. Devuelve el usuario sin hash o None si falla."""
    user = USUARIOS.get(username)
    if user and user["password_hash"] == _hash(password, SALT):
        return {"username": username, "rol": user["rol"], "nombre": user["nombre"]}
    return None

def usuario_activo() -> dict | None:
    return session.get("usuario")

def es_admin() -> bool:
    u = usuario_activo()
    return u is not None and u["rol"] == "admin"

# ── Decoradores de protección de rutas ──────────────────────────

def login_requerido(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not usuario_activo():
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "error": "No autenticado", "code": 401}), 401
            from flask import redirect, url_for
            return redirect(url_for("login_page"))
        return f(*args, **kwargs)
    return decorated

def solo_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not usuario_activo():  
            return jsonify({"success": False, "error": "No autenticado", "code": 401}), 401
        if not es_admin():
            return jsonify({"success": False, "error": "Acceso denegado: se requiere rol admin", "code": 403}), 403
        return f(*args, **kwargs)
    return decorated