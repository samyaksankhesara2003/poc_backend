#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Try venv first; fall back to global pip if venv is unavailable
if [ ! -f "venv/bin/activate" ]; then
    rm -rf venv 2>/dev/null || true
    echo "Creating Python virtual environment..."
    if python3 -m venv venv 2>/dev/null; then
        echo "Virtual environment created."
    else
        echo "⚠️  python3-venv not available. Installing globally with pip."
        echo "   (Run 'sudo apt install python3.10-venv' to use a venv instead.)"
        pip install --user -q -r requirements.txt
        echo "Starting audio analyzer on port 8100..."
        exec python3 -m uvicorn main:app --host 0.0.0.0 --port 8100 --workers 1
    fi
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install -q -r requirements.txt

echo "Starting audio analyzer on port 8100..."
exec uvicorn main:app --host 0.0.0.0 --port 8100 --workers 1
