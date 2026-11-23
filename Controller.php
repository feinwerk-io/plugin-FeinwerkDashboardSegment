<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Common;
use Piwik\Container\StaticContainer;
use Piwik\DataTable\Renderer\Json;
use Piwik\Nonce;
use Piwik\Piwik;
use Piwik\Plugin\Manager as PluginManager;
use Piwik\Plugins\FeinwerkDashboardSegment\ConnectorInstaller\ConnectorInstaller;
use Piwik\Url;
use Piwik\View;

class Controller extends \Piwik\Plugin\Controller
{
    /**
     * Returns the resolved override map for a dashboard on a site:
     * {
     *   "widgets": {
     *     "<instanceId>": {
     *       "segment": {"action":"set","segment":"..."} | {"action":"remove"},   // optional
     *       "period":  {"period":"day","date":"today"}                            // optional
     *     }
     *   },
     *   "defaultAction": {"action":"set","segment":"..."} | {"action":"remove"} | null
     * }
     */
    public function getSettings()
    {
        Piwik::checkUserIsNotAnonymous();
        $idDashboard = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite      = Common::getRequestVar('idSite', 0, 'int');

        $settings = API::getInstance()->getWidgetSettings($idDashboard, $idSite);

        $widgets = array();
        foreach ($settings['widgets'] as $uniqueId => $row) {
            $entry = array();
            if ($row['segment'] !== null && $row['segment'] !== '') {
                // Per-widget override always wins, so resolve with no default.
                $entry['segment'] = SegmentResolver::resolve($row['segment'], null);
            }
            if ($row['period'] !== null && $row['period'] !== '') {
                $entry['period'] = array('period' => $row['period'], 'date' => $row['date']);
            }
            if (!empty($entry)) {
                $widgets[$uniqueId] = $entry;
            }
        }

        $defaultAction = null;
        if ($settings['default'] !== null) {
            $defaultAction = SegmentResolver::resolve(null, $settings['default']);
        }

        Json::sendHeaderJSON();
        return json_encode(array(
            'widgets'       => (object) $widgets,
            'defaultAction' => $defaultAction,
        ));
    }

    public function saveWidgetSegment()
    {
        $this->checkTokenInUrl();
        Piwik::checkUserIsNotAnonymous();

        $idDashboard    = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite         = Common::getRequestVar('idSite', 0, 'int');
        $widgetUniqueId = Common::getRequestVar('widgetUniqueId', '', 'string');
        // Read our value under a dedicated param name ('segmentValue'), NOT 'segment':
        // ajaxHelper auto-injects the page's global 'segment'/'period'/'date' into every request,
        // which would otherwise clobber the value we want to store.
        // getRequestVar HTML-sanitizes (e.g. '>' => '&gt;'); reverse it to store the raw definition.
        $segment        = Common::unsanitizeInputValue(Common::getRequestVar('segmentValue', '', 'string'));

        API::getInstance()->setWidgetSegment($idDashboard, $idSite, $widgetUniqueId, $segment);

        Json::sendHeaderJSON();
        return json_encode(array('result' => 'success'));
    }

    public function saveWidgetPeriod()
    {
        $this->checkTokenInUrl();
        Piwik::checkUserIsNotAnonymous();

        $idDashboard    = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite         = Common::getRequestVar('idSite', 0, 'int');
        $widgetUniqueId = Common::getRequestVar('widgetUniqueId', '', 'string');
        // Distinct names so ajaxHelper's auto 'period'/'date' don't clobber ours.
        $period         = Common::getRequestVar('periodValue', '', 'string');
        $date           = Common::getRequestVar('dateValue', '', 'string');

        API::getInstance()->setWidgetPeriod($idDashboard, $idSite, $widgetUniqueId, $period, $date);

        Json::sendHeaderJSON();
        return json_encode(array('result' => 'success'));
    }

    public function saveDashboardDefault()
    {
        $this->checkTokenInUrl();
        Piwik::checkUserIsNotAnonymous();

        $idDashboard = Common::getRequestVar('idDashboard', 1, 'int');
        $idSite      = Common::getRequestVar('idSite', 0, 'int');
        // See saveWidgetSegment(): read 'segmentValue' (not 'segment') and un-sanitize it.
        $segment     = Common::unsanitizeInputValue(Common::getRequestVar('segmentValue', '', 'string'));

        API::getInstance()->setDashboardDefaultSegment($idDashboard, $idSite, $segment);

        Json::sendHeaderJSON();
        return json_encode(array('result' => 'success'));
    }

    /**
     * Returns the segments available to the current (logged-in) user for a site, as
     * [{definition, name}, ...]. Routed through this controller (not a direct module=API
     * call) so it runs in the authenticated UI session instead of as the anonymous user.
     */
    public function getSegments()
    {
        Piwik::checkUserIsNotAnonymous();
        $idSite = Common::getRequestVar('idSite', 0, 'int');

        $segments = \Piwik\Plugins\SegmentEditor\API::getInstance()->getAll($idSite ?: null);

        $result = array();
        foreach ($segments as $segment) {
            $result[] = array(
                'definition' => $segment['definition'],
                'name'       => $segment['name'],
            );
        }

        Json::sendHeaderJSON();
        return json_encode($result);
    }

    /**
     * Kit: the Feinwerk Connector installer page (ConnectorInstaller/ConnectorInstaller.php). Super users only.
     */
    public function connectorInstaller()
    {
        Piwik::checkUserHasSuperUserAccess();
        $env = ConnectorInstaller::environment();
        $redirect = ConnectorInstaller::redirectFor($env);
        if ($redirect !== null) {
            Url::redirectToUrl($redirect);

            return '';
        }

        return $this->renderConnectorInstaller($env, null);
    }

    /**
     * Kit: the click. Matomo's password check first (it comes back here by GET with these parameters), then the nonce
     * (verified and discarded, as Matomo's own install action does), then install when the files are missing, and
     * activate. Success: on to the connector; any failure: back on the page with Matomo's reason.
     */
    public function connectorInstallerRun()
    {
        Piwik::checkUserHasSuperUserAccess();
        $env = ConnectorInstaller::environment();
        $redirect = ConnectorInstaller::redirectFor($env);
        if ($redirect !== null) {
            // active: the connector; switched off: admin home (never the page's "open the connector" fallback)
            Url::redirectToUrl($redirect);

            return '';
        }
        $state = ConnectorInstaller::decide($env);
        if ($state !== ConnectorInstaller::INSTALL && $state !== ConnectorInstaller::ACTIVATE) {
            return $this->renderConnectorInstaller($env, null);
        }

        $nonce = Common::getRequestVar('nonce', '', 'string');
        $verified = StaticContainer::get(\Piwik\Plugins\Login\PasswordVerifier::class)->requirePasswordVerifiedRecently([
            'module' => ConnectorInstaller::PLUGIN,
            'action' => 'connectorInstallerRun',
            'nonce' => $nonce,
        ]);
        if (!$verified) {
            // Matomo sends the user to its password page and comes back here afterwards
            return '';
        }

        $error = Nonce::verifyNonceWithErrorMessage(ConnectorInstaller::NONCE, $nonce);
        if ($error !== '') {
            // Matomo's own reason, from its translations (may hold its FAQ link)
            return $this->renderConnectorInstaller($env, ['ok' => false, 'message' => $error, 'html' => true]);
        }
        Nonce::discardNonce(ConnectorInstaller::NONCE);

        $result = ConnectorInstaller::run(
            $env['present'],
            static function (): void {
                (new \Piwik\Plugins\CorePluginsAdmin\PluginInstaller())->installOrUpdatePluginFromMarketplace(ConnectorInstaller::CONNECTOR);
            },
            static function (): void {
                PluginManager::getInstance()->activatePlugin(ConnectorInstaller::CONNECTOR);
            }
        );
        if ($result['ok']) {
            Url::redirectToUrl(ConnectorInstaller::CONNECTOR_URL);
        }

        return $this->renderConnectorInstaller(ConnectorInstaller::environment(), $result);
    }

    /**
     * @param array<string, bool> $env
     * @param array{ok: bool, message: string, html: bool}|null $result
     */
    private function renderConnectorInstaller(array $env, ?array $result): string
    {
        $view = new View('@FeinwerkDashboardSegment/connectorInstaller');
        // an admin page: no website needed (the menu entry is reached from pages without idSite too), and Matomo's
        // admin rule for frames (enable_framed_settings, X-Frame-Options sameorigin by default)
        $this->setBasicVariablesView($view);
        \Piwik\Plugin\ControllerAdmin::setBasicVariablesAdminView($view);
        $state = ConnectorInstaller::decide($env);
        $view->installerState = $state;
        $view->installerError = $result !== null && !$result['ok'] ? $result : null;
        $view->installerNonce = $state === ConnectorInstaller::INSTALL || $state === ConnectorInstaller::ACTIVATE
            ? Nonce::getNonce(ConnectorInstaller::NONCE)
            : '';
        $view->installerLinks = ConnectorInstaller::manualLinks();
        $view->installerWordPressUrl = ConnectorInstaller::wordpressUrl();
        $view->installerConnectorUrl = ConnectorInstaller::CONNECTOR_URL;
        $view->installerPhpFloor = ConnectorInstaller::PHP_FLOOR;
        $view->installerPluginsAdmin = $env['pluginsAdmin'];
        $view->installerConsoleCommand = ConnectorInstaller::CONSOLE_COMMAND;

        return $view->render();
    }
}
