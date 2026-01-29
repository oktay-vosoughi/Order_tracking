#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_VERSION="${NODE_VERSION:-18}"
SUDO_CMD=""

if [[ "${EUID}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO_CMD="sudo"
  else
    echo "This script must be run as root or have sudo available." >&2
    exit 1
  fi
fi

detect_pkg_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  else
    echo ""
  fi
}

PKG_MANAGER="$(detect_pkg_manager)"

if [[ -z "${PKG_MANAGER}" ]]; then
  echo "Unsupported distribution. Install Node.js ${NODE_VERSION}+, npm, git, and MySQL manually." >&2
  exit 1
fi

install_os_packages() {
  local packages_common=("curl" "git")
  case "${PKG_MANAGER}" in
    apt)
      ${SUDO_CMD} apt-get update
      ${SUDO_CMD} apt-get install -y build-essential "${packages_common[@]}" mysql-server
      ;;
    dnf|yum)
      ${SUDO_CMD} ${PKG_MANAGER} install -y @'Development Tools' gcc-c++ make "${packages_common[@]}" mysql-server
      ;;
  esac
}

install_node() {
  if command -v node >/dev/null 2>&1; then
    CURRENT_NODE="$(node -v | sed 's/v//')"
    if [[ "${CURRENT_NODE%%.*}" -ge "${NODE_VERSION}" ]]; then
      echo "Node.js ${CURRENT_NODE} already installed."
      return
    fi
  fi

  case "${PKG_MANAGER}" in
    apt)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | ${SUDO_CMD} bash -
      ${SUDO_CMD} apt-get install -y nodejs
      ;;
    dnf|yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_VERSION}.x" | ${SUDO_CMD} bash -
      ${SUDO_CMD} ${PKG_MANAGER} install -y nodejs
      ;;
  esac
}

ensure_mysql_running() {
  if systemctl list-units --type=service | grep -qE 'mysqld|mysql'; then
    ${SUDO_CMD} systemctl enable --now mysqld >/dev/null 2>&1 || \
      ${SUDO_CMD} systemctl enable --now mysql >/dev/null 2>&1 || true
  fi
}

install_js_dependencies() {
  pushd "${PROJECT_ROOT}" >/dev/null
  npm install
  popd >/dev/null
}

main() {
  echo "Installing OS packages..."
  install_os_packages

  echo "Installing Node.js ${NODE_VERSION}.x..."
  install_node

  echo "Ensuring MySQL service is running..."
  ensure_mysql_running

  echo "Installing project npm dependencies..."
  install_js_dependencies

  cat <<'EOF'

✅ Requirements installed.

Next steps:
1. Copy / update server/.env with correct MySQL credentials.
2. Create the database: mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS order_Tracking CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;"
3. Run migrations: node server/run-migration.js <migration-file.sql>
4. Start API: npm run server
5. Build/start frontend: npm run build && npm run preview (or npm run dev for development)
EOF
}

main "$@"
