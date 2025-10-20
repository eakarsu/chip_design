#!/bin/bash

# AI Chip Design Platform - Startup Script
# This script handles port cleanup, environment checks, and application startup

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    print_info "Checking port $port..."

    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        print_warning "Port $port is in use. Attempting to free it..."
        lsof -Pi :$port -sTCP:LISTEN -t | xargs kill -9 2>/dev/null || true
        sleep 1

        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            print_error "Failed to free port $port"
            return 1
        else
            print_success "Port $port is now free"
        fi
    else
        print_success "Port $port is available"
    fi
}

# Function to check Node.js version
check_node() {
    print_info "Checking Node.js installation..."

    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        print_info "Please install Node.js >= 18.0.0"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2)
    REQUIRED_VERSION="18.0.0"

    if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
        print_error "Node.js version $NODE_VERSION is too old. Required: >= $REQUIRED_VERSION"
        exit 1
    fi

    print_success "Node.js version $NODE_VERSION is installed"
}

# Function to check npm version
check_npm() {
    print_info "Checking npm installation..."

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        exit 1
    fi

    NPM_VERSION=$(npm -v)
    print_success "npm version $NPM_VERSION is installed"
}

# Function to check environment file
check_env() {
    print_info "Checking environment configuration..."

    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_warning ".env file not found. Creating from .env.example..."
            cp .env.example .env
            print_warning "Please update .env with your actual configuration"
            print_info "Required: OPENROUTER_API_KEY"
            read -p "Press Enter to continue after updating .env, or Ctrl+C to exit..."
        else
            print_error ".env file not found and no .env.example to copy from"
            exit 1
        fi
    fi

    # Check if OPENROUTER_API_KEY is set
    if grep -q "OPENROUTER_API_KEY=your_openrouter_api_key_here" .env 2>/dev/null; then
        print_warning "OPENROUTER_API_KEY appears to be using default value"
        print_warning "Please update your .env file with a valid API key"
    fi

    print_success "Environment file exists"
}

# Function to check and install dependencies
check_dependencies() {
    print_info "Checking dependencies..."

    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found. Installing dependencies..."
        npm install
        print_success "Dependencies installed"
    else
        print_info "Checking if dependencies need updates..."
        if ! npm list &> /dev/null; then
            print_warning "Some dependencies are missing or outdated. Running npm install..."
            npm install
            print_success "Dependencies updated"
        else
            print_success "All dependencies are installed"
        fi
    fi
}

# Function to check database (if applicable)
check_database() {
    print_info "Checking database configuration..."

    # Check if docker-compose.yml has database services
    if grep -q "postgres\|mysql\|mongodb" docker-compose.yml 2>/dev/null; then
        print_info "Database service detected in docker-compose.yml"

        if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
            print_info "Checking if database containers are running..."

            if docker-compose ps | grep -q "Up"; then
                print_success "Database containers are running"
            else
                print_warning "Database containers are not running"
                read -p "Start database containers? (y/n) " -n 1 -r
                echo
                if [[ $REPLY =~ ^[Yy]$ ]]; then
                    docker-compose up -d
                    print_success "Database containers started"
                    sleep 3
                fi
            fi
        else
            print_warning "Docker or docker-compose not found. Skipping database check."
        fi
    else
        print_info "No database configuration found in docker-compose.yml"
    fi
}

# Function to run build (optional, for production)
build_app() {
    if [ "$1" == "--build" ] || [ "$1" == "-b" ]; then
        print_info "Building application..."
        npm run build
        print_success "Build completed"
        return 0
    fi
    return 1
}

# Function to start the application
start_app() {
    local mode=$1

    print_info "Starting application in $mode mode..."
    echo ""
    echo "================================================"
    print_success "Application is starting!"
    echo "================================================"
    echo ""

    if [ "$mode" == "production" ]; then
        npm run start
    else
        npm run dev
    fi
}

# Main execution
main() {
    echo ""
    echo "================================================"
    echo "  AI Chip Design Platform - Startup Script"
    echo "================================================"
    echo ""

    # Parse arguments
    MODE="development"
    BUILD=false

    for arg in "$@"; do
        case $arg in
            --prod|--production|-p)
                MODE="production"
                ;;
            --build|-b)
                BUILD=true
                ;;
            --help|-h)
                echo "Usage: ./start.sh [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --prod, -p          Start in production mode"
                echo "  --build, -b         Build before starting"
                echo "  --help, -h          Show this help message"
                echo ""
                echo "Examples:"
                echo "  ./start.sh                    # Start in development mode"
                echo "  ./start.sh --prod             # Start in production mode"
                echo "  ./start.sh --prod --build     # Build and start in production"
                exit 0
                ;;
        esac
    done

    # Step 1: Clean up ports
    print_info "Step 1/7: Cleaning up used ports..."
    kill_port 3000  # Next.js default port
    kill_port 80    # Nginx HTTP
    kill_port 443   # Nginx HTTPS
    echo ""

    # Step 2: Check Node.js
    print_info "Step 2/7: Checking Node.js..."
    check_node
    echo ""

    # Step 3: Check npm
    print_info "Step 3/7: Checking npm..."
    check_npm
    echo ""

    # Step 4: Check environment
    print_info "Step 4/7: Checking environment configuration..."
    check_env
    echo ""

    # Step 5: Check database
    print_info "Step 5/7: Checking database..."
    check_database
    echo ""

    # Step 6: Check dependencies
    print_info "Step 6/7: Checking dependencies..."
    check_dependencies
    echo ""

    # Step 7: Build if requested
    if [ "$BUILD" = true ] || [ "$MODE" == "production" ]; then
        print_info "Step 7/7: Building application..."
        npm run build
        echo ""
    else
        print_info "Step 7/7: Skipping build (development mode)"
        echo ""
    fi

    # Start the application
    start_app "$MODE"
}

# Run main function with all arguments
main "$@"
