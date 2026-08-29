"""Initial analytics schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # The application models create tables when bootstrapping an empty database.
    # This baseline migration is intentionally empty for existing deployments.
    pass


def downgrade():
    pass
