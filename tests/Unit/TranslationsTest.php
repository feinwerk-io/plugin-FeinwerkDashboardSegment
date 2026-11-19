<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The plugin ships English, German, French, Spanish and Italian (Peter, 2026-11-19: "bitte alle Plugins mindestens in
 * französisch, spanisch, italienisch, deutsch, englisch ausliefern"). Every language has exactly the English keys in
 * the English order and the same placeholders; no text has an en or em dash or a URL.
 *
 * @group FeinwerkDashboardSegment
 */
class TranslationsTest extends TestCase
{
    /** @return array<string, array<string, string>> every lang file of the plugin, by language */
    private static function translations(): array
    {
        $all = [];
        foreach (glob(__DIR__ . '/../../lang/*.json') ?: [] as $file) {
            $all[basename($file, '.json')] = json_decode((string) file_get_contents($file), true)['FeinwerkDashboardSegment'];
        }

        return $all;
    }

    public function test_the_five_languages_are_there(): void
    {
        foreach (['en', 'de', 'fr', 'es', 'it'] as $lang) {
            $this->assertArrayHasKey($lang, self::translations(), "lang/$lang.json");
        }
    }

    public function test_every_language_has_the_english_keys_in_the_english_order(): void
    {
        $all = self::translations();
        foreach ($all as $lang => $texts) {
            $this->assertSame(array_keys($all['en']), array_keys($texts), "keys and their order in $lang.json");
        }
    }

    public function test_every_text_has_the_same_placeholders_in_every_language(): void
    {
        $placeholders = static function (string $text): array {
            preg_match_all('/%(?:\d+\$)?s/', $text, $m);
            $found = $m[0];
            sort($found);

            return $found;
        };
        $all = self::translations();
        foreach ($all as $lang => $texts) {
            foreach ($all['en'] as $key => $text) {
                $this->assertSame($placeholders($text), $placeholders((string) ($texts[$key] ?? '')), "$lang $key");
            }
        }
    }

    public function test_no_text_has_a_dash_or_a_url(): void
    {
        foreach (self::translations() as $lang => $texts) {
            foreach ($texts as $key => $text) {
                $this->assertDoesNotMatchRegularExpression('/[\x{2013}\x{2014}]/u', $text, "$lang $key: no en or em dash");
                $this->assertStringNotContainsString('http', $text, "$lang $key: URLs stay in PHP");
                $this->assertNotSame('', trim($text), "$lang $key");
            }
        }
    }
}
