from typing import List, Optional
from pydantic import BaseModel, Field


# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    rol: str


# --- Productos ---
class ProductoBase(BaseModel):
    codigo_barras: Optional[str] = None
    nombre: str = Field(..., min_length=2)
    categoria: str = Field(..., min_length=2)
    precio_costo: float = Field(..., ge=0)
    precio_venta: float = Field(..., ge=0)
    stock_actual: int = Field(..., ge=0)
    stock_minimo: int = Field(default=5, ge=0)
    imagen: Optional[str] = None


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    codigo_barras: Optional[str] = None
    nombre: Optional[str] = None
    categoria: Optional[str] = None
    precio_costo: Optional[float] = Field(default=None, ge=0)
    precio_venta: Optional[float] = Field(default=None, ge=0)
    stock_actual: Optional[int] = Field(default=None, ge=0)
    stock_minimo: Optional[int] = Field(default=None, ge=0)
    imagen: Optional[str] = None


class ProductoResponse(ProductoBase):
    id: int


# --- Clientes ---
class ClienteBase(BaseModel):
    nombre: str = Field(..., min_length=2)
    telefono: str = Field(..., min_length=6)
    email: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None


class ClienteResponse(ClienteBase):
    id: int
    fecha_registro: str


# --- Ventas (Checkout) ---
class ItemCarrito(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)


class NuevoClienteCheckout(BaseModel):
    nombre: str
    telefono: str
    email: Optional[str] = None


class VentaCreate(BaseModel):
    items: List[ItemCarrito] = Field(..., min_length=1)
    cliente_id: Optional[int] = None
    nuevo_cliente: Optional[NuevoClienteCheckout] = None
    usuario_id: int = 1
