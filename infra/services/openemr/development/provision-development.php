<?php
// Runs only in the isolated development container, as apache, with no secret argv.
declare(strict_types=1);
if (getenv('VEMS_DEVELOPMENT') !== 'true' || PHP_SAPI !== 'cli') { exit(1); }
ini_set('display_errors', '0');
try {
    chdir('/var/www/localhost/htdocs/openemr');
    $ignoreAuth = true;
    $sessionAllowWrite = true;
    $_GET['site'] = 'default';
    require 'interface/globals.php';
    $session = OpenEMR\Common\Session\SessionWrapperFactory::getInstance()->getActiveSession();
    $admin = sqlQuery('SELECT id, username FROM users WHERE username = ?', [getenv('OPENEMR_ADMIN_USER')]);
    if (!$admin) { throw new RuntimeException('Admin unavailable'); }
    $session->set('authUser', $admin['username']);
    $session->set('authUserID', $admin['id']);
    $session->set('authProvider', 'Default');
    $username = getenv('OPENEMR_USERNAME');
    $existing = sqlQuery('SELECT id FROM users WHERE username = ?', [$username]);
    if (!$existing) {
        $auth = new OpenEMR\Common\Auth\AuthUtils();
        $adminPassword = getenv('OPENEMR_ADMIN_PASSWORD');
        $password = getenv('OPENEMR_PASSWORD');
        $data = ['username' => $username, 'password' => 'NoLongerUsed', 'fname' => 'VEMS', 'lname' => 'Development Integration', 'active' => 1, 'authorized' => 1, 'facility_id' => 1, 'calendar' => 0];
        if (!$auth->updatePassword($admin['id'], 0, $adminPassword, $password, true, $data, $username)) { throw new RuntimeException('User creation failed'); }
        $uuid = OpenEMR\Common\Uuid\UuidRegistry::getRegistryForTable('users')->createUuid();
        sqlStatement('UPDATE users SET uuid = ? WHERE username = ?', [$uuid, $username]);
    }
    // The standard API's encounter-create route requires encounters:auth_a, which Clinicians lack but Physicians hold.
    if (!in_array('Physicians', OpenEMR\Common\Acl\AclExtended::aclGetGroupTitles($username) ?? [], true)) {
        if (!OpenEMR\Common\Acl\AclExtended::setUserAro(['Physicians'], $username, 'VEMS', '', 'Development Integration')) { throw new RuntimeException('ACL creation failed'); }
    }
    // Match the upstream usergroup_admin.php account-creation flow, including login group membership.
    if (!sqlQuery('SELECT name FROM `groups` WHERE user = ?', [$username])) {
        $group = sqlQuery('SELECT name FROM `groups` WHERE user = ? LIMIT 1', [$admin['username']]);
        if (!$group) { throw new RuntimeException('Administrator login group missing'); }
        sqlStatement('INSERT INTO `groups` (name, user) VALUES (?, ?)', [$group['name'], $username]);
    }
    $repository = new OpenEMR\Common\Auth\OpenIDConnect\Repositories\ClientRepository();
    $id = getenv('OPENEMR_CLIENT_ID');
    if (!$repository->getClientEntity($id)) {
        $info = ['client_role' => 'user', 'client_name' => 'VEMS isolated development',
            'client_secret' => getenv('OPENEMR_CLIENT_SECRET'),
            'registration_access_token' => $repository->generateRegistrationAccessToken(),
            'registration_client_uri_path' => $repository->generateRegistrationClientUriPath(),
            'contacts' => 'development@vems.invalid', 'redirect_uris' => ['http://127.0.0.1:3001/callback'],
            'grant_types' => 'password', 'scope' => getenv('OPENEMR_SCOPE'), 'dsi_type' => OpenEMR\Common\Auth\OpenIDConnect\Entities\ClientEntity::DSI_TYPE_NONE];
        if (!$repository->insertNewClient($id, $info, 'default')) { throw new RuntimeException('Client creation failed'); }
        $repository->saveIsEnabled($repository->getClientEntity($id), true);
    }
    // Keep an already-registered client's scope in step with the configured scope; identity and secret are untouched.
    $scope = getenv('OPENEMR_SCOPE');
    sqlStatement('UPDATE oauth_clients SET scope = ? WHERE client_id = ? AND scope <> ?', [$scope, $id, $scope]);
    if (!$repository->validateClient($id, getenv('OPENEMR_CLIENT_SECRET'), 'password')) { throw new RuntimeException('Existing client credentials mismatch'); }
    echo "OpenEMR development identity and client ready; credentials preserved.\n";
} catch (Throwable $e) {
    fwrite(STDERR, "OpenEMR development provisioning failed; no credential details emitted (line " . $e->getLine() . ").\n");
    exit(1);
}
