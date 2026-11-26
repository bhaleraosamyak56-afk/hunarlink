"""Add 7 strictly additive CraftProof AI & Demand Bridge tables.

Revision ID: 0004_add_craftproof_and_demand_bridge
Revises: 0003_add_admin_credentials
Create Date: 2026-11-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision = "0004_add_craftproof_and_demand_bridge"
down_revision = "0003_add_admin_credentials"
branch_labels = None
depends_on = None


def _uuid_col() -> sa.types.TypeEngine:
    return sa.String(length=36).with_variant(
        mysql.CHAR(36, charset="ascii", collation="ascii_bin"), "mysql"
    )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if not insp.has_table("craft_passports"):
        op.create_table(
            "craft_passports",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("passport_code", sa.String(length=40), nullable=False),
            sa.Column("listing_id", _uuid_col(), nullable=False),
            sa.Column("product_id", _uuid_col(), nullable=False),
            sa.Column("seller_profile_id", _uuid_col(), nullable=False),
            sa.Column("public_slug", sa.String(length=260), nullable=False),
            sa.Column(
                "overall_trust_level",
                sa.String(length=32),
                nullable=False,
                server_default="SELLER_DECLARED",
            ),
            sa.Column("materials_summary", sa.Text(), nullable=True),
            sa.Column("manufacturing_process", sa.Text(), nullable=True),
            sa.Column("origin_location", sa.String(length=180), nullable=True),
            sa.Column("craft_days_estimated", sa.Integer(), nullable=True),
            sa.Column("artisan_story", sa.Text(), nullable=True),
            sa.Column("fair_craft_breakdown_json", sa.JSON(), nullable=True),
            sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["listing_id"], ["seller_product_listings.id"], name="fk_cp_listing"),
            sa.ForeignKeyConstraint(["product_id"], ["products.id"], name="fk_cp_product"),
            sa.ForeignKeyConstraint(["seller_profile_id"], ["seller_profiles.id"], name="fk_cp_seller"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("passport_code", name="uq_craft_passports_code"),
            sa.UniqueConstraint("listing_id", name="uq_craft_passports_listing"),
            sa.UniqueConstraint("public_slug", name="uq_craft_passports_slug"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )

    if not insp.has_table("craft_product_claims"):
        op.create_table(
            "craft_product_claims",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("passport_id", _uuid_col(), nullable=False),
            sa.Column("claim_type", sa.String(length=32), nullable=False),
            sa.Column("claim_title", sa.String(length=160), nullable=False),
            sa.Column("claim_value", sa.String(length=500), nullable=False),
            sa.Column(
                "claim_source",
                sa.String(length=32),
                nullable=False,
                server_default="SELLER_DECLARED",
            ),
            sa.Column(
                "verification_status",
                sa.String(length=32),
                nullable=False,
                server_default="SELLER_DECLARED",
            ),
            sa.Column("verified_by_user_id", _uuid_col(), nullable=True),
            sa.Column("verified_by_authority", sa.String(length=180), nullable=True),
            sa.Column("verified_at", sa.DateTime(), nullable=True),
            sa.Column("decision_notes", sa.String(length=1000), nullable=True),
            sa.Column("ai_advisory_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["passport_id"], ["craft_passports.id"], name="fk_cpc_passport"),
            sa.ForeignKeyConstraint(["verified_by_user_id"], ["users.id"], name="fk_cpc_verified_by"),
            sa.PrimaryKeyConstraint("id"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )

    if not insp.has_table("craft_claim_evidence"):
        op.create_table(
            "craft_claim_evidence",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("claim_id", _uuid_col(), nullable=False),
            sa.Column("passport_id", _uuid_col(), nullable=False),
            sa.Column("evidence_type", sa.String(length=40), nullable=False),
            sa.Column("file_scan_id", _uuid_col(), nullable=True),
            sa.Column("storage_key", sa.String(length=512), nullable=True),
            sa.Column("original_filename", sa.String(length=255), nullable=True),
            sa.Column("external_reference_url", sa.String(length=512), nullable=True),
            sa.Column("sha256_hash", sa.String(length=64), nullable=True),
            sa.Column("caption", sa.String(length=500), nullable=True),
            sa.Column("uploaded_by_user_id", _uuid_col(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["claim_id"], ["craft_product_claims.id"], name="fk_cce_claim"),
            sa.ForeignKeyConstraint(["passport_id"], ["craft_passports.id"], name="fk_cce_passport"),
            sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], name="fk_cce_uploader"),
            sa.PrimaryKeyConstraint("id"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )

    if not insp.has_table("craft_verification_events"):
        op.create_table(
            "craft_verification_events",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("passport_id", _uuid_col(), nullable=False),
            sa.Column("claim_id", _uuid_col(), nullable=True),
            sa.Column("event_type", sa.String(length=40), nullable=False),
            sa.Column("from_status", sa.String(length=32), nullable=True),
            sa.Column("to_status", sa.String(length=32), nullable=True),
            sa.Column("actor_type", sa.String(length=32), nullable=False),
            sa.Column("actor_user_id", _uuid_col(), nullable=True),
            sa.Column("summary", sa.String(length=500), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("is_legal_proof", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["passport_id"], ["craft_passports.id"], name="fk_cve_passport"),
            sa.ForeignKeyConstraint(["claim_id"], ["craft_product_claims.id"], name="fk_cve_claim"),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name="fk_cve_actor"),
            sa.CheckConstraint(
                "NOT (actor_type = 'AI_ADVISORY' AND (to_status IN ('HUMAN_VERIFIED', 'THIRD_PARTY_VERIFIED') OR is_legal_proof = 1))",
                name="chk_cve_ai_never_verifies",
            ),
            sa.PrimaryKeyConstraint("id"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )

    if not insp.has_table("artisan_capabilities"):
        op.create_table(
            "artisan_capabilities",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("seller_profile_id", _uuid_col(), nullable=False),
            sa.Column("category_slug", sa.String(length=140), nullable=False),
            sa.Column("craft_techniques_json", sa.JSON(), nullable=False),
            sa.Column("monthly_capacity_units", sa.Integer(), nullable=False, server_default="25"),
            sa.Column("min_order_qty", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("standard_lead_time_days", sa.Integer(), nullable=False, server_default="18"),
            sa.Column("unit_price_min_inr", sa.Numeric(14, 2), nullable=False, server_default="1500.00"),
            sa.Column("unit_price_max_inr", sa.Numeric(14, 2), nullable=False, server_default="12000.00"),
            sa.Column("supports_custom_design", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("accepts_wholesale", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("availability_status", sa.String(length=24), nullable=False, server_default="AVAILABLE"),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["seller_profile_id"], ["seller_profiles.id"], name="fk_ac_seller"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("seller_profile_id", "category_slug", name="uq_artisan_cap_seller_cat"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )

    if not insp.has_table("buyer_demand_requests"):
        op.create_table(
            "buyer_demand_requests",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("request_code", sa.String(length=40), nullable=False),
            sa.Column("buyer_user_id", _uuid_col(), nullable=True),
            sa.Column("buyer_name", sa.String(length=160), nullable=True),
            sa.Column("buyer_email", sa.String(length=255), nullable=True),
            sa.Column("raw_request_text", sa.Text(), nullable=False),
            sa.Column("structured_requirements_json", sa.JSON(), nullable=False),
            sa.Column("category_slug", sa.String(length=140), nullable=True),
            sa.Column("requested_quantity", sa.Integer(), nullable=False, server_default="10"),
            sa.Column("budget_min_inr", sa.Numeric(14, 2), nullable=True),
            sa.Column("budget_max_inr", sa.Numeric(14, 2), nullable=True),
            sa.Column("target_delivery_days", sa.Integer(), nullable=True),
            sa.Column("requires_verified_claims", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("allow_cluster_pooling", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("fulfillment_mode", sa.String(length=32), nullable=False, server_default="SINGLE_ARTISAN"),
            sa.Column("request_status", sa.String(length=24), nullable=False, server_default="MATCHED"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["buyer_user_id"], ["users.id"], name="fk_bdr_buyer"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("request_code", name="uq_bdr_code"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )

    if not insp.has_table("demand_artisan_matches"):
        op.create_table(
            "demand_artisan_matches",
            sa.Column("id", _uuid_col(), nullable=False),
            sa.Column("demand_request_id", _uuid_col(), nullable=False),
            sa.Column("seller_profile_id", _uuid_col(), nullable=False),
            sa.Column("match_rank", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("is_cluster_member", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("allocated_quantity", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("match_score", sa.Numeric(5, 2), nullable=False),
            sa.Column("score_breakdown_json", sa.JSON(), nullable=False),
            sa.Column("match_reasons_json", sa.JSON(), nullable=False),
            sa.Column("estimated_unit_price_inr", sa.Numeric(14, 2), nullable=True),
            sa.Column("estimated_lead_days", sa.Integer(), nullable=True),
            sa.Column("match_status", sa.String(length=24), nullable=False, server_default="SUGGESTED"),
            sa.Column("artisan_response_note", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["demand_request_id"], ["buyer_demand_requests.id"], name="fk_dam_request"),
            sa.ForeignKeyConstraint(["seller_profile_id"], ["seller_profiles.id"], name="fk_dam_seller"),
            sa.PrimaryKeyConstraint("id"),
            mysql_engine="InnoDB",
            mysql_charset="utf8mb4",
            mysql_collate="utf8mb4_0900_ai_ci",
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    for table in (
        "demand_artisan_matches",
        "buyer_demand_requests",
        "artisan_capabilities",
        "craft_verification_events",
        "craft_claim_evidence",
        "craft_product_claims",
        "craft_passports",
    ):
        if insp.has_table(table):
            op.drop_table(table)
