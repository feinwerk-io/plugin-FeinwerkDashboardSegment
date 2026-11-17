<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;
use Piwik\Http\HttpCodeException;
use Piwik\Plugins\FeinwerkDashboardSegment\API;
use Piwik\Plugins\FeinwerkDashboardSegment\Dao\WidgetSettings;
use Piwik\Plugins\FeinwerkDashboardSegment\Exception\InvalidRequestException;
use Piwik\Plugins\FeinwerkDashboardSegment\Exception\StoredForAnotherUserException;

/**
 * Invalid input answers HTTP 400 and stores nothing; a key held by another user answers HTTP 409 without naming them.
 *
 * @group FeinwerkDashboardSegment
 */
class APIValidationTest extends TestCase
{
    /** @var object */
    private $dao;
    /** @var API */
    private $api;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dao = new class extends WidgetSettings {
            public $calls = array();
            public function __construct()
            {
            }
            public function setSegment($login, $idDashboard, $idSite, $widgetUniqueId, $segment)
            {
                $this->calls[] = array('setSegment', $widgetUniqueId, $segment);
            }
            public function setPeriod($login, $idDashboard, $idSite, $widgetUniqueId, $period, $date)
            {
                $this->calls[] = array('setPeriod', $widgetUniqueId, $period, $date);
            }
            public function clearPeriod($login, $idDashboard, $idSite, $widgetUniqueId)
            {
                $this->calls[] = array('clearPeriod', $widgetUniqueId);
            }
        };
        $this->api = new class ($this->dao) extends API {
            protected function checkAndGetLogin(int $idSite): string
            {
                return 'alice';
            }
        };
    }

    /** @return array<string,array{0:string,1:string}> */
    public static function validPeriods(): array
    {
        return array(
            'day today'       => array('day', 'today'),
            'day yesterday'   => array('day', 'yesterday'),
            'week of a date'  => array('week', '2026-11-02'),
            'last 30 days'    => array('range', 'last30'),
            'previous 7 days' => array('range', 'previous7'),
            'custom range'    => array('range', '2026-10-01,2026-10-31'),
        );
    }

    /** @dataProvider validPeriods */
    public function test_a_period_matomo_can_show_is_stored(string $period, string $date): void
    {
        $this->api->setWidgetPeriod(5, 1, 'widgetA', $period, $date);

        $this->assertSame(array(array('setPeriod', 'widgetA', $period, $date)), $this->dao->calls);
    }

    /** @return array<string,array{0:string,1:string}> */
    public static function invalidPeriods(): array
    {
        return array(
            'unknown period'          => array('quarter', 'today'),
            'range without a span'    => array('range', 'today'),
            'single period with span' => array('day', 'last7'),
            'malformed date'          => array('month', '2026-1-1'),
            'empty date'              => array('day', ''),
            'impossible day'          => array('day', '2026-02-30'),
            'range ending too early'  => array('range', '2026-10-31,2026-10-01'),
        );
    }

    /** @dataProvider invalidPeriods */
    public function test_an_invalid_period_answers_400_and_stores_nothing(string $period, string $date): void
    {
        try {
            $this->api->setWidgetPeriod(5, 1, 'widgetA', $period, $date);
            $this->fail('expected HTTP 400');
        } catch (InvalidRequestException $e) {
            $this->assertSame(400, $e->getCode());
        }
        $this->assertSame(array(), $this->dao->calls);
    }

    public function test_clearing_a_period_needs_no_date(): void
    {
        $this->api->setWidgetPeriod(5, 1, 'widgetA', '', 'anything');

        $this->assertSame(array(array('clearPeriod', 'widgetA')), $this->dao->calls);
    }

    public function test_an_empty_widget_id_answers_400(): void
    {
        foreach (array(
            function () {
                $this->api->setWidgetSegment(5, 1, '  ', 'referrerType==search');
            },
            function () {
                $this->api->setWidgetPeriod(5, 1, '', 'day', 'today');
            },
        ) as $call) {
            try {
                $call();
                $this->fail('expected HTTP 400');
            } catch (InvalidRequestException $e) {
                $this->assertSame(400, $e->getCode());
            }
        }
        $this->assertSame(array(), $this->dao->calls);
    }

    public function test_the_exceptions_carry_their_http_code_for_matomo(): void
    {
        $conflict = new StoredForAnotherUserException();

        $this->assertInstanceOf(HttpCodeException::class, new InvalidRequestException('x'));
        $this->assertInstanceOf(HttpCodeException::class, $conflict);
        $this->assertSame(409, $conflict->getCode());
        $this->assertStringContainsString('another user', $conflict->getMessage());
    }
}
