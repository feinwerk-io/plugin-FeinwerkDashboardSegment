<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit\ConnectorInstaller;

use PHPUnit\Framework\TestCase;
use Twig\Environment;
use Twig\Loader\ArrayLoader;
use Twig\Loader\ChainLoader;
use Twig\Loader\FilesystemLoader;
use Twig\TwigFilter;
use Twig\TwigFunction;

/** The installer page rendered with Twig itself: a button only where one click works, a message escaped unless HTML. */
class ConnectorInstallerTemplateTest extends TestCase
{
    /** @param array<string, mixed> $vars */
    private function render(array $vars): string
    {
        $files = new FilesystemLoader();
        $files->addPath(__DIR__ . '/../../../templates', 'FeinwerkDashboardSegment');
        // admin.twig of Matomo, reduced to the content block
        $twig = new Environment(new ChainLoader([new ArrayLoader(['admin.twig' => '{% block content %}{% endblock %}']), $files]), [
            'strict_variables' => false,
            'autoescape' => 'html',
        ]);
        $twig->addFilter(new TwigFilter('translate', static function (string $key, ...$args): string {
            return $key . ($args === [] ? '' : '(' . implode(',', $args) . ')');
        }));
        $twig->addFunction(new TwigFunction('linkTo', static function (array $params): string {
            return 'index.php?' . http_build_query($params);
        }));

        return $twig->render('@FeinwerkDashboardSegment/connectorInstaller.twig', $vars + [
            'installerError' => null,
            'installerNonce' => 'n0nce',
            'installerLinks' => ['marketplace' => 'https://plugins.matomo.org/x', 'download' => 'https://plugins.feinwerk.io/x'],
            'installerWordPressUrl' => '',
            'installerConnectorUrl' => 'index.php?module=FeinwerkMarketplaceConnector&action=index',
            'installerPhpFloor' => '8.1.0',
        ]);
    }

    public function test_install_and_activate_show_one_button_with_the_nonce(): void
    {
        $install = $this->render(['installerState' => 'install']);
        self::assertSame(1, substr_count($install, 'fwci__run'));
        self::assertStringContainsString('action=connectorInstallerRun&amp;nonce=n0nce', $install);
        self::assertStringContainsString('FeinwerkDashboardSegment_ConnectorInstallerButton<', str_replace([' ', "\n"], '', $install));

        $activate = $this->render(['installerState' => 'activate']);
        self::assertStringContainsString('FeinwerkDashboardSegment_ConnectorInstallerButtonActivate', $activate);
    }

    public function test_no_button_where_one_click_cannot_work(): void
    {
        foreach (['manual', 'php', 'wordpress'] as $state) {
            self::assertStringNotContainsString('fwci__run', $this->render(['installerState' => $state]), $state);
        }
        $manual = $this->render(['installerState' => 'manual']);
        self::assertStringContainsString('href="https://plugins.feinwerk.io/x" target="_blank" rel="noopener"', $manual);
        self::assertStringContainsString('FeinwerkDashboardSegment_ConnectorInstallerPhp(8.1.0)', $this->render(['installerState' => 'php']));
    }

    public function test_an_error_is_escaped_unless_matomo_marks_it_as_html(): void
    {
        $text = $this->render(['installerState' => 'install', 'installerError' => ['ok' => false, 'message' => '<script>x</script>', 'html' => false]]);
        $html = $this->render(['installerState' => 'install', 'installerError' => ['ok' => false, 'message' => 'not <b>writable</b>', 'html' => true]]);

        self::assertStringContainsString('&lt;script&gt;x&lt;/script&gt;', $text);
        self::assertStringNotContainsString('<script>', $text);
        self::assertStringContainsString('not <b>writable</b>', $html);
    }
}
