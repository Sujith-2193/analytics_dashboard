"""Initial analytics schema baseline."""
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Baseline revision for the schema already managed by the application's
    # model bootstrap. Future schema changes should be real Alembic revisions.
    pass


def downgrade():
    pass
