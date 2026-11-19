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
 * Matomo renders its bar at the top (website, date, segment, Manage Dashboard) with Template.nextToCalendar; the plugin
 * puts a slot there, after Matomo's own segment selector, that the script fills with the dashboard default segment button.
 *
 * @group FeinwerkDashboardSegment
 */
class DashboardSlotTest extends TestCase
{
    /** @var FeinwerkDashboardSegment */
    private $plugin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->plugin = (new \ReflectionClass(FeinwerkDashboardSegment::class))->newInstanceWithoutConstructor();
    }

    public function test_registersTheDashboardEvent()
    {
        $events = $this->plugin->registerEvents();

        $this->assertSame(array('function' => 'renderTopControlSlot', 'after' => true), $events['Template.nextToCalendar'] ?? null);
        $this->assertArrayNotHasKey('Template.beforeDashboardWidgets', $events, 'no line above the widgets any more');
    }

    public function test_appendsTheSlotToOtherPluginsOutput()
    {
        $out = '<div class="other"></div>';

        $this->plugin->renderTopControlSlot($out);

        $this->assertSame('<div class="other"></div><div id="fwds-topcontrol-slot" class="fwds-topControlSlot"></div>', $out);
    }
}
