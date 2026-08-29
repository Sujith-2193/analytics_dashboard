"""Initial analytics schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Baseline revision for the existing schema. Fresh installs are bootstrapped
    # by the application's model metadata; future schema changes use Alembic.
    pass

def downgrade():
    pass
