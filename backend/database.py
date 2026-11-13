import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from security import hash_password

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = BASE_DIR / "data" / "petshop.db"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB_PATH)))
INIT_SQL_PATH = BASE_DIR / "init.sql"


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DATABASE_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


@contextmanager
def transaction_scope():
    """Context manager para transacciones seguras con COMMIT y ROLLBACK automático."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Ejecuta init.sql y crea usuarios y catálogo semilla si la BD está vacía."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with transaction_scope() as conn:
        if INIT_SQL_PATH.exists():
            sql_script = INIT_SQL_PATH.read_text(encoding="utf-8")
            conn.executescript(sql_script)

        # Migración ligera: asegurar columna 'imagen' en tabla productos si ya existía la BD
        cols = [
            row["name"]
            for row in conn.execute("PRAGMA table_info(productos)").fetchall()
        ]
        if "imagen" not in cols:
            conn.execute("ALTER TABLE productos ADD COLUMN imagen TEXT;")

        # Sembrar usuarios por defecto si no existen
        cur = conn.execute("SELECT COUNT(*) as c FROM usuarios")
        if cur.fetchone()["c"] == 0:
            conn.execute(
                "INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)",
                ("admin", hash_password("admin123"), "admin"),
            )
            conn.execute(
                "INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)",
                ("cajero", hash_password("cajero123"), "cajero"),
            )
