<?php
/**
 * vtiger-install-cli.php
 *
 * Headless installer for vtiger CRM 8.3.0 — invoked by install-vtiger.sh
 * via `php -f /opt/vems/init-scripts/vtiger-install-cli.php` from /var/www/html.
 *
 * All configuration is read from environment variables that entrypoint.sh has
 * already exported before calling install-vtiger.sh.
 *
 * What this script does:
 *   1. Validates required env vars are present.
 *   2. Connects to MySQL and verifies the database is reachable.
 *   3. Bootstraps vtiger's own Installer class (modules/Install/Install.php)
 *      which creates the full schema, loads base data, and writes tabdata.php.
 *   4. Creates / updates the admin user record with the configured credentials.
 *   5. Writes a populated config.inc.php (the template rendering in entrypoint.sh
 *      already did this, but the installer may overwrite it; we re-stamp it here
 *      to ensure our env-driven values survive).
 *   6. Exits 0 on success, non-zero on any failure — so install-vtiger.sh can
 *      propagate the error and prevent a broken container from becoming healthy.
 *
 * Compatibility: vtiger CRM 8.3.x (PHP 8.x, mysqli extension required).
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log_msg(string $msg): void
{
    $ts = date('Y-m-d H:i:s');
    fwrite(STDOUT, "[vems-vtiger-cli-install] [{$ts}] {$msg}\n");
}

function log_err(string $msg): void
{
    $ts = date('Y-m-d H:i:s');
    fwrite(STDERR, "[vems-vtiger-cli-install] [{$ts}] ERROR: {$msg}\n");
}

function env_required(string $name): string
{
    $val = getenv($name);
    if ($val === false || $val === '') {
        log_err("Required environment variable '{$name}' is not set.");
        exit(1);
    }
    return $val;
}

function env_default(string $name, string $default): string
{
    $val = getenv($name);
    return ($val !== false && $val !== '') ? $val : $default;
}

// ---------------------------------------------------------------------------
// Must run from the vtiger app root
// ---------------------------------------------------------------------------

$app_root = rtrim((string) getcwd(), '/');
if (!file_exists($app_root . '/index.php') || !file_exists($app_root . '/composer.json')) {
    log_err("Must be run from the vtiger app root (/var/www/html). cwd={$app_root}");
    exit(1);
}

log_msg("Running from app root: {$app_root}");

// ---------------------------------------------------------------------------
// Read configuration from environment
// ---------------------------------------------------------------------------

$db_host     = env_required('DB_HOST');
$db_port     = (int) env_default('DB_PORT', '3306');
$db_name     = env_required('DB_NAME');
$db_user     = env_required('DB_USER');
$db_pass     = env_required('DB_PASSWORD');

$admin_user  = env_default('VTIGER_ADMIN_USER',     'admin');
$admin_pass  = env_default('VTIGER_ADMIN_PASSWORD',  'Admin@123');
$admin_email = env_default('VTIGER_ADMIN_EMAIL',     'admin@example.com');
$site_url    = env_default('VTIGER_SITE_URL',        'http://localhost:8080');
$timezone    = env_default('VTIGER_TIMEZONE',        'UTC');
$language    = env_default('VTIGER_LANGUAGE',        'en_us');
$currency    = env_default('VTIGER_CURRENCY',        'USD');
$company     = env_default('VTIGER_COMPANY_NAME',    'VEMS');

log_msg("DB:    {$db_user}@{$db_host}:{$db_port}/{$db_name}");
log_msg("Admin: {$admin_user} <{$admin_email}>");
log_msg("URL:   {$site_url}");

// ---------------------------------------------------------------------------
// Step 1: Verify MySQL connectivity before touching anything
// ---------------------------------------------------------------------------

log_msg("Verifying MySQL connectivity...");
$mysqli = @new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
if ($mysqli->connect_errno) {
    log_err("MySQL connection failed: [{$mysqli->connect_errno}] {$mysqli->connect_error}");
    log_err("Hint: ensure DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME are correct and the");
    log_err("      database and user have been created by init-vtiger.sh before this runs.");
    exit(1);
}
log_msg("MySQL connection OK.");

// ---------------------------------------------------------------------------
// Step 2: Check if schema already exists (idempotency guard)
// ---------------------------------------------------------------------------

$result = $mysqli->query(
    "SELECT COUNT(*) AS cnt FROM information_schema.tables
     WHERE table_schema = '{$mysqli->real_escape_string($db_name)}'
       AND table_name IN ('vtiger_users','vtiger_tab','vtiger_version')"
);
if (!$result) {
    log_err("Failed to query information_schema: {$mysqli->error}");
    exit(1);
}
$row = $result->fetch_assoc();
$core_table_count = (int) ($row['cnt'] ?? 0);

if ($core_table_count >= 2) {
    log_msg("Core vtiger tables already present ({$core_table_count}); skipping schema install.");
    $mysqli->close();
    // Still fall through to admin-user stamp in case password changed.
} else {
    $mysqli->close();

    // -----------------------------------------------------------------------
    // Step 3: Bootstrap vtiger's own installer
    // -----------------------------------------------------------------------

    log_msg("Core tables not found. Bootstrapping vtiger installer classes...");

    // vtiger CRM 8.x ships its installer under modules/Install/.
    // We set the constants and globals the installer bootstrap expects, then
    // instantiate the Installer class to drive the install programmatically.

    // These constants must be defined before any vtiger include.
    define('VTIGER_ROOT_DIRECTORY', $app_root . '/');
    define('FROM_VTIGERCRM_APP',    true);

    // Suppress any HTML output the installer may attempt to write.
    ob_start();

    // Load vtiger's root include path bootstrap.
    $include_dir = $app_root . '/include';
    if (!is_dir($include_dir)) {
        log_err("vtiger include/ directory not found at {$include_dir}. App root may not be synced.");
        exit(1);
    }

    // Populate $_REQUEST / superglobals that vtiger installer code may read.
    $_SERVER['SERVER_NAME']  = parse_url($site_url, PHP_URL_HOST) ?: 'localhost';
    $_SERVER['SERVER_PORT']  = (string) (parse_url($site_url, PHP_URL_PORT) ?: 80);
    $_SERVER['REQUEST_URI']  = '/';
    $_SERVER['HTTPS']        = (parse_url($site_url, PHP_URL_SCHEME) === 'https') ? 'on' : 'off';
    $_SERVER['HTTP_HOST']    = $_SERVER['SERVER_NAME'];

    // Installer-specific POST params (used by modules/Install/Install.php).
    $_REQUEST = $_POST = [
        'db_server'    => $db_host,
        'db_port'      => (string) $db_port,
        'db_username'  => $db_user,
        'db_password'  => $db_pass,
        'db_name'      => $db_name,
        'overwrite_db' => '0',
        'create_db'    => '0',   // DB already created by init-vtiger.sh
        'username'     => $admin_user,
        'password'     => $admin_pass,
        'retype_password' => $admin_pass,
        'email'        => $admin_email,
        'site_URL'     => $site_url,
        'timezone'     => $timezone,
        'language'     => $language,
        'currency'     => $currency,
        'company_name' => $company,
    ];

    // Load the vtiger installer class.
    $installer_path = $app_root . '/modules/Install/Install.php';
    if (!file_exists($installer_path)) {
        log_err("Installer not found at {$installer_path}.");
        log_err("The app root may not be fully synced from the dist image.");
        exit(1);
    }

    log_msg("Loading {$installer_path}...");
    require_once $installer_path;

    if (!class_exists('Install') && !class_exists('Vtiger_Install_View')) {
        // vtiger 8 names the installer view class differently — try the view loader.
        $view_path = $app_root . '/modules/Install/views/Install.php';
        if (file_exists($view_path)) {
            require_once $view_path;
        }
    }

    // vtiger 8.3 exposes a static method or a direct procedural flow in Install.php.
    // The file may self-execute when included (older vtiger style) or expose a class.
    // Check what we have after the include.

    ob_end_clean();
    ob_start();

    $install_succeeded = false;

    if (class_exists('Install')) {
        log_msg("Found Install class; invoking Install::createSchema()...");
        try {
            $installer = new Install();
            if (method_exists($installer, 'createSchema')) {
                $installer->createSchema();
                $install_succeeded = true;
            } elseif (method_exists($installer, 'process')) {
                $installer->process();
                $install_succeeded = true;
            } else {
                log_err("Install class has neither createSchema() nor process() method.");
                log_err("Inspect modules/Install/Install.php to find the correct entry point.");
                exit(1);
            }
        } catch (Throwable $e) {
            ob_end_clean();
            log_err("Installer threw: " . $e->getMessage());
            log_err($e->getTraceAsString());
            exit(1);
        }
    } else {
        // The include already executed the installer procedurally (vtiger 7-style fallback).
        // Trust the output buffer for diagnostics but check tables to confirm.
        log_msg("No Install class found — assuming procedural installer ran on include.");
        $install_succeeded = true;
    }

    ob_end_clean();

    if (!$install_succeeded) {
        log_err("Installer did not complete successfully.");
        exit(1);
    }

    // -----------------------------------------------------------------------
    // Step 4: Verify schema was created
    // -----------------------------------------------------------------------

    log_msg("Verifying schema creation...");
    $verify = new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
    if ($verify->connect_errno) {
        log_err("Post-install DB connect failed: {$verify->connect_error}");
        exit(1);
    }
    $vres = $verify->query(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_schema = '{$verify->real_escape_string($db_name)}'
           AND table_name IN ('vtiger_users','vtiger_tab','vtiger_version')"
    );
    $vrow = $vres ? $vres->fetch_assoc() : ['cnt' => 0];
    $post_count = (int) ($vrow['cnt'] ?? 0);
    $verify->close();

    if ($post_count < 2) {
        log_err("Schema install appears to have failed: only {$post_count} core table(s) found.");
        log_err("Review installer output above for errors.");
        exit(1);
    }
    log_msg("Schema install confirmed: {$post_count} core tables present.");
}

// ---------------------------------------------------------------------------
// Step 5: Stamp admin user record with configured credentials
//
// The installer may create the admin user with a different password hash
// algorithm than what the env vars specified. We update vtiger_users directly
// to ensure the credentials in the env vars are what actually work at login.
// ---------------------------------------------------------------------------

log_msg("Stamping admin user '{$admin_user}' in vtiger_users...");

$db = new mysqli($db_host, $db_user, $db_pass, $db_name, $db_port);
if ($db->connect_errno) {
    log_err("Cannot connect to stamp admin: {$db->connect_error}");
    exit(1);
}

// vtiger uses MD5 for password storage in the users table.
$pass_md5 = md5($admin_pass);

// Check if admin user already exists.
$esc_user  = $db->real_escape_string($admin_user);
$esc_email = $db->real_escape_string($admin_email);

$check = $db->query("SELECT id FROM vtiger_users WHERE user_name = '{$esc_user}' LIMIT 1");
if (!$check) {
    log_err("Failed to query vtiger_users: {$db->error}");
    $db->close();
    exit(1);
}

if ($check->num_rows > 0) {
    $upd = $db->query(
        "UPDATE vtiger_users
            SET user_password = '{$pass_md5}',
                email1        = '{$esc_email}',
                status        = 'Active',
                is_admin      = 'on'
          WHERE user_name = '{$esc_user}'"
    );
    if (!$upd) {
        log_err("Failed to update admin user: {$db->error}");
        $db->close();
        exit(1);
    }
    log_msg("Admin user updated (rows affected: {$db->affected_rows}).");
} else {
    // Should not happen after a successful schema install, but handle gracefully.
    log_err("Admin user '{$admin_user}' not found after install. Manual intervention needed.");
    $db->close();
    exit(1);
}

$db->close();

// ---------------------------------------------------------------------------
// Step 6: Re-stamp config.inc.php with env-driven values
//
// vtiger's installer may rewrite config.inc.php with its own values during
// the schema creation step. We overwrite it here to guarantee the env var
// values (especially DB credentials and site URL) are what the running
// container actually uses.
// ---------------------------------------------------------------------------

$config_path   = $app_root . '/config.inc.php';
$template_path = '/opt/vems/templates/config.inc.php.tpl';

if (file_exists($template_path)) {
    log_msg("Re-stamping {$config_path} from template...");
    $tpl = file_get_contents($template_path);
    if ($tpl === false) {
        log_err("Cannot read template {$template_path}.");
        exit(1);
    }
    $replacements = [
        '${DB_HOST}'              => $db_host,
        '${DB_PORT}'              => (string) $db_port,
        '${DB_USER}'              => $db_user,
        '${DB_PASSWORD}'          => $db_pass,
        '${DB_NAME}'              => $db_name,
        '${VTIGER_SITE_URL}'      => $site_url,
        '${VTIGER_TIMEZONE}'      => $timezone,
        '${VTIGER_LANGUAGE}'      => $language,
        '${VTIGER_CURRENCY}'      => $currency,
        '${VTIGER_COMPANY_NAME}'  => $company,
        '${VTIGER_ADMIN_EMAIL}'   => $admin_email,
        '${VTIGER_ADMIN_USER}'    => $admin_user,
        '${VTIGER_ADMIN_PASSWORD}'=> $admin_pass,
    ];
    $rendered = str_replace(array_keys($replacements), array_values($replacements), $tpl);
    if (file_put_contents($config_path, $rendered) === false) {
        log_err("Cannot write {$config_path}. Check file permissions.");
        exit(1);
    }
    log_msg("config.inc.php re-stamped successfully.");
} else {
    log_msg("Template {$template_path} not found; skipping config re-stamp.");
}

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

log_msg("vtiger headless install complete. Container is ready.");
exit(0);
