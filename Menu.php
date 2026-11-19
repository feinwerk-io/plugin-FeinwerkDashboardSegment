<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment;

use Piwik\Menu\MenuAdmin;
use Piwik\Plugins\FeinwerkDashboardSegment\ConnectorInstaller\ConnectorInstaller;

/**
 * Administration menu: only the Feinwerk Connector installer (kit). The plugin's own controls live on the dashboard.
 */
class Menu extends \Piwik\Plugin\Menu
{
    public function configureAdminMenu(MenuAdmin $menu)
    {
        $this->addConnectorInstaller($menu);
    }

    /**
     * Kit: "Feinwerk Plugins" > "Feinwerk Connector installieren" (or "aktivieren") for super users while the connector
     * is not active, once across all Feinwerk plugins (ConnectorInstaller::claim()). The connector's own entries take the
     * same section once it is active. Never breaks the menu.
     */
    private function addConnectorInstaller(MenuAdmin $menu): void
    {
        try {
            $state = ConnectorInstaller::decide(ConnectorInstaller::environment());
            if ($state === ConnectorInstaller::HIDDEN || !ConnectorInstaller::claim()) {
                return;
            }
            $menu->addItem(
                'FeinwerkDashboardSegment_ConnectorInstallerSection',
                $state === ConnectorInstaller::ACTIVATE
                    ? 'FeinwerkDashboardSegment_ConnectorInstallerMenuActivate'
                    : 'FeinwerkDashboardSegment_ConnectorInstallerMenu',
                $this->urlForAction('connectorInstaller'),
                1
            );
        } catch (\Throwable $e) {
            // an installer entry never breaks Matomo's menu
        }
    }
}
