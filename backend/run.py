import os
import uvicorn
from app import create_app

app = create_app(os.getenv('APP_ENV') or os.getenv('FLASK_ENV', 'development'))

if __name__ == '__main__':
    uvicorn.run("run:app", host='0.0.0.0', port=5001, reload=True)
