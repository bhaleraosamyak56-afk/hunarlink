"""Layer 7: Inventory & procurement stock-entry guardrails.

Enforces:
  - Atomic conditional updates (never negative available/reserved stock even under
    concurrent purchases).
  - Supplier-reported lots NEVER add dealer inventory.
  - Received quantity cannot exceed ordered PO quantity without explicit exception approval.
  - Accepted goods enter dealer sellable inventory ONLY after a passing quality
    inspection and at most ONCE per goods_receipt_item.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.base import new_uuid, utcnow
from app.models.core_models import (
    GoodsReceiptItem,
    InventoryTransaction,
    QualityInspection,
    StockReservation,
    SupplierPurchaseOrderItem,
    WarehouseStock,
)


def reserve_stock_atomic(
    db: Session,
    *,
    warehouse_stock_id: str,
    quantity: Decimal,
    scope: str,
    actor_user_id: str,
    retail_order_id: str | None = None,
    wholesale_order_id: str | None = None,
    ttl_minutes: int = 15,
) -> StockReservation:
    """Atomic conditional stock reservation preventing overselling under concurrency."""
    if quantity <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reservation quantity must be positive.",
        )

    # Atomic conditional UPDATE guarantees available_quantity can never drop below 0
    # even when two transactions execute concurrently!
    result = db.execute(
        update(WarehouseStock)
        .where(
            WarehouseStock.id == warehouse_stock_id,
            WarehouseStock.available_quantity >= quantity,
        )
        .values(
            available_quantity=WarehouseStock.available_quantity - quantity,
            reserved_quantity=WarehouseStock.reserved_quantity + quantity,
            version=WarehouseStock.version + 1,
        )
    )
    if result.rowcount != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Insufficient available stock; overselling prevented.",
        )

    stock = db.scalar(select(WarehouseStock).where(WarehouseStock.id == warehouse_stock_id))
    assert stock is not None

    reservation = StockReservation(
        id=new_uuid(),
        warehouse_stock_id=warehouse_stock_id,
        reservation_scope=scope,
        retail_order_id=retail_order_id,
        wholesale_order_id=wholesale_order_id,
        reserved_by_user_id=actor_user_id,
        reserved_quantity=quantity,
        reservation_status="ACTIVE",
        expires_at=utcnow() + timedelta(minutes=ttl_minutes),
    )
    db.add(reservation)
    db.add(
        InventoryTransaction(
            id=new_uuid(),
            warehouse_stock_id=stock.id,
            warehouse_id=stock.warehouse_id,
            product_variant_id=stock.product_variant_id,
            movement_type="RESERVE",
            quantity_delta=-quantity,
            available_after=stock.available_quantity,
            reserved_after=stock.reserved_quantity,
            damaged_after=stock.damaged_quantity,
            reference_type=scope,
            reference_id=retail_order_id or wholesale_order_id,
            actor_user_id=actor_user_id,
            reason="Atomic stock reservation for order checkout",
        )
    )
    return reservation


def post_goods_receipt_to_dealer_inventory(
    db: Session,
    *,
    goods_receipt_item_id: str,
    warehouse_stock_id: str,
    actor_user_id: str,
    overage_exception_approved: bool = False,
) -> InventoryTransaction:
    """Move inspected, accepted goods into dealer inventory strictly ONCE."""
    gri = db.scalar(select(GoodsReceiptItem).where(GoodsReceiptItem.id == goods_receipt_item_id))
    if gri is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goods receipt item not found.")
    if gri.inventory_posted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Goods receipt item has already been posted to dealer inventory.",
        )

    po_item = db.scalar(
        select(SupplierPurchaseOrderItem).where(
            SupplierPurchaseOrderItem.id == gri.supplier_po_item_id
        )
    )
    if po_item is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Referenced PO item missing.")

    if gri.received_quantity > po_item.ordered_quantity and not overage_exception_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Received quantity ({gri.received_quantity}) exceeds ordered PO quantity "
                f"({po_item.ordered_quantity}) without explicit exception approval."
            ),
        )

    inspection = db.scalar(
        select(QualityInspection).where(
            QualityInspection.goods_receipt_id == gri.goods_receipt_id,
            QualityInspection.inspection_outcome.in_(["PASSED", "PARTIALLY_PASSED"]),
        )
    )
    if inspection is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passing quality inspection is required before posting stock into dealer inventory.",
        )

    stock = db.scalar(select(WarehouseStock).where(WarehouseStock.id == warehouse_stock_id))
    if stock is None or stock.owner_type != "DEALER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target warehouse stock must belong to an approved DEALER warehouse.",
        )

    # Conditional guard prevents double-posting even under concurrent requests
    marked = db.execute(
        update(GoodsReceiptItem)
        .where(
            GoodsReceiptItem.id == gri.id,
            GoodsReceiptItem.inventory_posted == False,  # noqa: E712
        )
        .values(inventory_posted=True)
    )
    if marked.rowcount != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Goods receipt item already posted by a concurrent request.",
        )

    stock.available_quantity = stock.available_quantity + gri.accepted_quantity
    stock.damaged_quantity = stock.damaged_quantity + gri.damaged_quantity
    stock.version += 1

    tx = InventoryTransaction(
        id=new_uuid(),
        warehouse_stock_id=stock.id,
        warehouse_id=stock.warehouse_id,
        product_variant_id=stock.product_variant_id,
        goods_receipt_item_id=gri.id,
        movement_type="GOODS_RECEIPT_ACCEPT",
        quantity_delta=gri.accepted_quantity,
        available_after=stock.available_quantity,
        reserved_after=stock.reserved_quantity,
        damaged_after=stock.damaged_quantity,
        reference_type="GOODS_RECEIPT_ITEM",
        reference_id=gri.id,
        actor_user_id=actor_user_id,
        reason="Inspected accepted goods posted into dealer sellable stock",
    )
    db.add(tx)
    return tx
