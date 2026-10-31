import os
import secrets
from pathlib import Path
import click
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import inspect, text

db = SQLAlchemy()
bcrypt = Bcrypt()

def create_app():
    load_dotenv()
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY") or secrets.token_hex(32)

    instance_dir = Path(__file__).resolve().parent.parent / "instance"
    instance_dir.mkdir(exist_ok=True)
    sqlite_path = instance_dir / "defect_ai_local.db"

    default_db_url = f"sqlite:///{sqlite_path.as_posix()}"
    database_url = os.getenv("DATABASE_URL", default_db_url)
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
    elif database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

    db.init_app(app)
    bcrypt.init_app(app)
    CORS(app, supports_credentials=True)

    from app.routes import main
    app.register_blueprint(main)

    with app.app_context():
        from app import models
        db.create_all()
        _ensure_db_schema()

    @app.cli.command("promote-admin")
    @click.argument("email")
    def promote_admin(email):
        """Promote an existing registered account to Lead Administrator."""
        from app.models import User

        user = User.query.filter_by(email=email.strip().lower()).first()
        if user is None:
            raise click.ClickException(
                f"No account found for {email}. Register that account before promoting it."
            )
        user.role = "Lead Administrator"
        user.is_admin = True
        db.session.commit()
        click.echo(f"{user.email} is now a Lead Administrator.")

    return app


def _ensure_db_schema():
    """Ensures newly added columns (role, is_admin) exist in existing database schemas."""
    columns = {column["name"] for column in inspect(db.engine).get_columns("user")}
    with db.engine.begin() as connection:
        if "role" not in columns:
            connection.execute(
                text("ALTER TABLE user ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'Engineer'")
            )
        if "is_admin" not in columns:
            connection.execute(
                text("ALTER TABLE user ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE")
            )
