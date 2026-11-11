<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Plugins\FeinwerkDashboardSegment\FeinwerkDashboardSegment;

/**
 * The super user's hint about dashboard sharing, which moved to Feinwerk Dashboard Sharing: none while that plugin is
 * active or nothing was shared, "activate" when it is installed but switched off (Matomo deactivates plugins during an
 * update), "install" only when it is missing.
 *
 * @group FeinwerkDashboardSegment
 */
class SharingNoticeTest extends TestCase
{
    public function test_no_hint_while_sharing_is_active_or_nothing_was_shared(): void
    {
        $this->assertNull(FeinwerkDashboardSegment::sharingNotice(true, true, 3));
        $this->assertNull(FeinwerkDashboardSegment::sharingNotice(false, false, 0));
        $this->assertNull(FeinwerkDashboardSegment::sharingNotice(false, true, 0));
    }

    /** Found in the Matomo 6 rehearsal: an installed but deactivated plugin was told to be installed. */
    public function test_installed_but_inactive_asks_to_activate_it(): void
    {
        $this->assertSame('FeinwerkDashboardSegment_SharingInactiveNotice', FeinwerkDashboardSegment::sharingNotice(false, true, 1));
    }

    public function test_missing_asks_to_install_it(): void
    {
        $this->assertSame('FeinwerkDashboardSegment_SharingMovedNotice', FeinwerkDashboardSegment::sharingNotice(false, false, 1));
    }

    public function test_both_hints_exist_in_german_and_english_without_dashes(): void
    {
        foreach (['en', 'de'] as $language) {
            $texts = json_decode((string) file_get_contents(__DIR__ . '/../../lang/' . $language . '.json'), true);
            foreach (['SharingMovedNotice', 'SharingInactiveNotice'] as $key) {
                $text = $texts['FeinwerkDashboardSegment'][$key] ?? '';
                $this->assertNotSame('', $text, $language . ' ' . $key);
                $this->assertDoesNotMatchRegularExpression('/[\x{2013}\x{2014}]/u', $text, $language . ' ' . $key);
            }
        }
    }
}
