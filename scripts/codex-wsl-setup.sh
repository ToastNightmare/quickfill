#!/usr/bin/env bash
set -Eeuo pipefail

IFS=$'\n\t'
umask 077

secure_temp_file=""

fail() {
  printf 'QuickFill setup error: %s\n' "$1" >&2
  exit 1
}

note() {
  printf 'QuickFill setup: %s\n' "$1"
}

cleanup_secure_temp() {
  if [[ -n "$secure_temp_file" && -f "$secure_temp_file" && ! -L "$secure_temp_file" ]]; then
    rm -f -- "$secure_temp_file"
  fi
}

trap cleanup_secure_temp EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 ||
    fail "Required command is unavailable: $1"
}

require_secure_regular_file() {
  local file_path="$1"
  local label="$2"
  local file_mode
  local file_owner

  [[ ! -L "$file_path" && -f "$file_path" ]] ||
    fail "$label must be a regular non-symlink file."

  file_mode="$(stat -c '%a' -- "$file_path")" ||
    fail "Unable to inspect $label permissions."
  [[ "$file_mode" == "600" ]] ||
    fail "$label must have mode 600."

  file_owner="$(stat -c '%u' -- "$file_path")" ||
    fail "Unable to inspect $label ownership."
  [[ "$file_owner" == "$(id -u)" ]] ||
    fail "$label must be owned by the current user."
}

read_env_value() {
  local file_path="$1"
  local variable_name="$2"
  local result_name="$3"
  local line
  local value=""
  local match_count=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      "$variable_name="*)
        value="${line#*=}"
        ((match_count += 1))
        ;;
    esac
  done <"$file_path"

  [[ "$match_count" -eq 1 ]] ||
    fail "The Clerk QA source must define $variable_name exactly once."

  case "$value" in
    \"*\")
      value="${value:1:${#value}-2}"
      ;;
    \'*\')
      value="${value:1:${#value}-2}"
      ;;
  esac

  [[ -n "$value" ]] ||
    fail "The Clerk QA source contains an empty $variable_name."

  printf -v "$result_name" '%s' "$value"
}

validate_managed_destination() {
  local file_path="$1"
  local line
  local value
  local publishable_count=0
  local secret_count=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    case "$line" in
      ""|\#*)
        ;;
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=*)
        value="${line#*=}"
        [[ "$value" == pk_test_* ]] ||
          fail "The managed Clerk QA destination must use a Development publishable key."
        ((publishable_count += 1))
        ;;
      CLERK_SECRET_KEY=*)
        value="${line#*=}"
        [[ "$value" == sk_test_* ]] ||
          fail "The managed Clerk QA destination must use a Development secret key."
        ((secret_count += 1))
        ;;
      *)
        fail "Existing .env.local is not a Clerk-QA-only managed destination."
        ;;
    esac
  done <"$file_path"

  [[ "$publishable_count" -eq 1 && "$secret_count" -eq 1 ]] ||
    fail "The managed Clerk QA destination must contain exactly the two approved variables."
}

for required_command in git realpath stat id uname node corepack mkdir mktemp chmod mv rm; do
  require_command "$required_command"
done

[[ "$(uname -s)" == "Linux" ]] ||
  fail "This setup script supports Linux under WSL2 only."

kernel_release="$(uname -r)"
case "${kernel_release,,}" in
  *microsoft-standard-wsl2*|*wsl2*)
    ;;
  *)
    fail "This setup script must run inside WSL2."
    ;;
esac

[[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" == "true" ]] ||
  fail "Run this script from the QuickFill Git worktree."

repository_root="$(git rev-parse --show-toplevel 2>/dev/null)" ||
  fail "Unable to resolve the Git worktree root."
repository_root="$(realpath -e -- "$repository_root")" ||
  fail "Unable to canonicalize the Git worktree root."
working_directory="$(pwd -P)"

[[ "$working_directory" == "$repository_root" ]] ||
  fail "Run this script from the QuickFill repository root."

[[ -f package.json && ! -L package.json ]] ||
  fail "QuickFill package.json is missing or unsafe."
[[ -f pnpm-lock.yaml && ! -L pnpm-lock.yaml ]] ||
  fail "QuickFill pnpm-lock.yaml is missing or unsafe."
[[ -f AGENTS.md && ! -L AGENTS.md ]] ||
  fail "QuickFill AGENTS.md is missing or unsafe."

package_name="$(node -p "require('./package.json').name || ''")" ||
  fail "Unable to read package.json."
[[ "$package_name" == "quickfill" ]] ||
  fail "This is not the QuickFill repository."

if [[ -n "${CODEX_WORKTREE_PATH:-}" ]]; then
  [[ "$CODEX_WORKTREE_PATH" == /* ]] ||
    fail "CODEX_WORKTREE_PATH must be an absolute Linux path."
  resolved_codex_worktree="$(realpath -e -- "$CODEX_WORKTREE_PATH")" ||
    fail "CODEX_WORKTREE_PATH does not resolve to this worktree."
  [[ "$resolved_codex_worktree" == "$repository_root" ]] ||
    fail "CODEX_WORKTREE_PATH does not match the current worktree."
fi

export TMPDIR=/tmp
export TMP=/tmp
export TEMP=/tmp

[[ -d "$TMPDIR" && -w "$TMPDIR" ]] ||
  fail "The Linux temporary directory /tmp is unavailable."

package_manager="$(node -p "require('./package.json').packageManager || ''")" ||
  fail "Unable to read the packageManager declaration."
[[ "$package_manager" =~ ^pnpm@([0-9]+\.[0-9]+\.[0-9]+)$ ]] ||
  fail "package.json must declare an exact pnpm version."
required_pnpm_version="${BASH_REMATCH[1]}"

[[ -n "${HOME:-}" && "$HOME" == /* ]] ||
  fail "HOME must be an absolute Linux path."

user_bin="$HOME/.local/bin"
if [[ -e "$user_bin" || -L "$user_bin" ]]; then
  [[ -d "$user_bin" && ! -L "$user_bin" ]] ||
    fail "The user package-manager bin path must be a regular directory."
else
  mkdir -p -- "$user_bin" ||
    fail "Unable to create the user package-manager bin directory."
  chmod 755 -- "$user_bin" ||
    fail "Unable to secure the user package-manager bin directory."
fi

user_bin_owner="$(stat -c '%u' -- "$user_bin")" ||
  fail "Unable to inspect the user package-manager bin directory."
[[ "$user_bin_owner" == "$(id -u)" ]] ||
  fail "The user package-manager bin directory must be owned by the current user."

chmod go-w -- "$user_bin" ||
  fail "Unable to secure the user package-manager bin directory."

user_bin_mode="$(stat -c '%a' -- "$user_bin")" ||
  fail "Unable to inspect the user package-manager bin permissions."
(( (8#$user_bin_mode & 8#22) == 0 )) ||
  fail "The user package-manager bin directory must not be group- or world-writable."

corepack enable --install-directory "$user_bin" pnpm ||
  fail "Unable to enable pnpm in the user-owned bin directory."

pnpm_command="$user_bin/pnpm"
[[ -x "$pnpm_command" ]] ||
  fail "Corepack did not create an executable pnpm shim."

actual_pnpm_version="$("$pnpm_command" --version)" ||
  fail "Unable to activate $package_manager."
[[ "$actual_pnpm_version" == "$required_pnpm_version" ]] ||
  fail "Corepack activated a pnpm version that does not match package.json."

if "$pnpm_command" install --frozen-lockfile --offline; then
  note "Installed dependencies from the local pnpm cache with the frozen lockfile."
else
  note "The offline cache was incomplete; retrying the frozen install with setup-phase network access."
  "$pnpm_command" install --frozen-lockfile ||
    fail "Dependency installation failed with the frozen lockfile."
fi

destination_file="$repository_root/.env.local"
git check-ignore -q -- .env.local ||
  fail ".env.local must remain ignored by Git."

if [[ -e "$destination_file" || -L "$destination_file" ]]; then
  require_secure_regular_file "$destination_file" "Clerk QA destination"
  validate_managed_destination "$destination_file"
fi

if [[ -z "${CODEX_SOURCE_TREE_PATH:-}" ]]; then
  note "CODEX_SOURCE_TREE_PATH is unavailable; leaving Clerk QA credentials unprovisioned."
  note "Setup complete."
  exit 0
fi

[[ "$CODEX_SOURCE_TREE_PATH" == /* ]] ||
  fail "CODEX_SOURCE_TREE_PATH must be an absolute Linux path."
source_root="$(realpath -e -- "$CODEX_SOURCE_TREE_PATH")" ||
  fail "Unable to resolve CODEX_SOURCE_TREE_PATH."
[[ -d "$source_root" ]] ||
  fail "CODEX_SOURCE_TREE_PATH must identify a directory."

source_file="$source_root/.env.local"
if [[ ! -e "$source_file" && ! -L "$source_file" ]]; then
  note "No approved secure Clerk QA source exists; leaving credentials unprovisioned."
  note "Setup complete."
  exit 0
fi

require_secure_regular_file "$source_file" "Clerk QA source"
source_file="$(realpath -e -- "$source_file")" ||
  fail "Unable to canonicalize the Clerk QA source."
[[ "$source_file" != "$destination_file" ]] ||
  fail "The Clerk QA source and destination must be different files."

source_git_root="$(git -C "$source_root" rev-parse --show-toplevel 2>/dev/null)" ||
  fail "The Clerk QA source must belong to the same Git repository."
source_git_root="$(realpath -e -- "$source_git_root")" ||
  fail "Unable to canonicalize the source Git worktree."
[[ "$source_git_root" == "$source_root" ]] ||
  fail "CODEX_SOURCE_TREE_PATH must identify the source repository root."

destination_common_dir="$(git rev-parse --path-format=absolute --git-common-dir)" ||
  fail "Unable to resolve the destination Git common directory."
source_common_dir="$(git -C "$source_root" rev-parse --path-format=absolute --git-common-dir)" ||
  fail "Unable to resolve the source Git common directory."
destination_common_dir="$(realpath -e -- "$destination_common_dir")" ||
  fail "Unable to canonicalize the destination Git common directory."
source_common_dir="$(realpath -e -- "$source_common_dir")" ||
  fail "Unable to canonicalize the source Git common directory."
[[ "$source_common_dir" == "$destination_common_dir" ]] ||
  fail "The Clerk QA source must come from the same Git repository."

clerk_publishable_key=""
clerk_secret_key=""
read_env_value "$source_file" NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY clerk_publishable_key
read_env_value "$source_file" CLERK_SECRET_KEY clerk_secret_key

[[ "$clerk_publishable_key" == pk_test_* ]] ||
  fail "The Clerk QA source publishable key is not a Development key."
[[ "$clerk_secret_key" == sk_test_* ]] ||
  fail "The Clerk QA source secret key is not a Development key."

secure_temp_file="$(mktemp "$repository_root/.env.local.codex.XXXXXX")" ||
  fail "Unable to create the ignored Clerk QA destination safely."
temp_relative_path="${secure_temp_file#"$repository_root/"}"
git check-ignore -q -- "$temp_relative_path" ||
  fail "The temporary Clerk QA destination must remain ignored by Git."

{
  printf '%s\n' '# Managed by scripts/codex-wsl-setup.sh; Clerk Development QA only.'
  printf 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=%s\n' "$clerk_publishable_key"
  printf 'CLERK_SECRET_KEY=%s\n' "$clerk_secret_key"
} >"$secure_temp_file" ||
  fail "Unable to write the Clerk QA destination."

chmod 600 -- "$secure_temp_file" ||
  fail "Unable to secure the Clerk QA destination."
mv -f -- "$secure_temp_file" "$destination_file" ||
  fail "Unable to install the Clerk QA destination."
secure_temp_file=""

require_secure_regular_file "$destination_file" "Clerk QA destination"
validate_managed_destination "$destination_file"
unset clerk_publishable_key clerk_secret_key

note "Provisioned only the approved Clerk Development QA variables in ignored .env.local."
note "Setup complete."
