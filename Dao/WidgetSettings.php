<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\Dao;

use Piwik\Common;
use Piwik\Db;
use Piwik\DbHelper;

/**
 * One row per (login, dashboard, site, widget instance). A row may carry a segment override
 * and/or a period/date override independently; the row is removed once neither remains.
 *
 * Logins are compared exactly. The table compares `login` with its collation (Matomo 5.0 created plugin tables with the
 * server's default one), which can treat two different Matomo users as one ("Anna" and "anna", depending on the
 * collation also "ß" and "ss"). So every query keyed by login adds a binary comparison, and an upsert refuses a key that
 * another login holds instead of overwriting that user's row.
 */
class WidgetSettings
{
    /** the binary comparison every login-keyed query adds after `login` = ? (which keeps the primary key usable) */
    private const EXACT_LOGIN = 'CAST(`login` AS BINARY) = CAST(? AS BINARY)';

    private $table = 'dashboard_widget_settings';
    private $tablePrefixed;

    public function __construct()
    {
        $this->tablePrefixed = Common::prefixTable($this->table);
    }

    public function install()
    {
        DbHelper::createTable($this->table, "
            `login` VARCHAR(100) NOT NULL,
            `iddashboard` INT(10) UNSIGNED NOT NULL,
            `idsite` INT(10) UNSIGNED NOT NULL,
            `widget_uniqueid` VARCHAR(255) NOT NULL,
            `segment` TEXT NULL DEFAULT NULL,
            `period` VARCHAR(50) NULL DEFAULT NULL,
            `date` VARCHAR(50) NULL DEFAULT NULL,
            PRIMARY KEY (`login`, `iddashboard`, `idsite`, `widget_uniqueid`)");
    }

    public function uninstall()
    {
        Db::query(sprintf('DROP TABLE IF EXISTS `%s`', $this->tablePrefixed));
    }

    /**
     * A key (login, dashboard, site, widget) that the collation matches for another login cannot hold this user's row:
     * ON DUPLICATE KEY would update the other user's row. Refuse; the save fails visibly.
     */
    private function assertKeyNotHeldByAnotherLogin($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        $rows = Db::fetchAll(
            sprintf('SELECT `login` FROM `%s` WHERE `login` = ? AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?', $this->tablePrefixed),
            array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
        foreach ($rows as $row) {
            if ((string) $row['login'] !== (string) $login) {
                throw new \Exception('This widget setting is stored for another user.');
            }
        }
    }

    /**
     * The keys a copy would write, (target login, target dashboard, site, widget) for every source row, must not be held
     * by another login the collation matches for the target login. One query; the database compares the keys with the
     * same collation as the primary key.
     */
    private function assertCopyTargetNotHeldByAnotherLogin($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
    {
        $held = Db::fetchOne(
            sprintf(
                'SELECT COUNT(*) FROM `%1$s` src JOIN `%1$s` dst
                    ON dst.`login` = ? AND CAST(dst.`login` AS BINARY) <> CAST(? AS BINARY) AND dst.`iddashboard` = ?
                    AND dst.`idsite` = src.`idsite` AND dst.`widget_uniqueid` = src.`widget_uniqueid`
                 WHERE src.`login` = ? AND CAST(src.`login` AS BINARY) = CAST(? AS BINARY) AND src.`iddashboard` = ?',
                $this->tablePrefixed
            ),
            array($toLogin, $toLogin, (int) $toIdDashboard, $fromLogin, $fromLogin, (int) $fromIdDashboard)
        );
        if ((int) $held > 0) {
            throw new \Exception('This widget setting is stored for another user.');
        }
    }

    /** Upsert only the segment column (leaves any period/date override untouched). */
    public function setSegment($login, $idDashboard, $idSite, $widgetUniqueId, $segment)
    {
        $this->assertKeyNotHeldByAnotherLogin($login, $idDashboard, $idSite, $widgetUniqueId);
        $sql = sprintf(
            'INSERT INTO `%s` (`login`, `iddashboard`, `idsite`, `widget_uniqueid`, `segment`)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE `segment` = VALUES(`segment`)',
            $this->tablePrefixed
        );
        Db::query($sql, array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId, $segment));
    }

    /** Upsert only the period/date columns (leaves any segment override untouched). */
    public function setPeriod($login, $idDashboard, $idSite, $widgetUniqueId, $period, $date)
    {
        $this->assertKeyNotHeldByAnotherLogin($login, $idDashboard, $idSite, $widgetUniqueId);
        $sql = sprintf(
            'INSERT INTO `%s` (`login`, `iddashboard`, `idsite`, `widget_uniqueid`, `period`, `date`)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE `period` = VALUES(`period`), `date` = VALUES(`date`)',
            $this->tablePrefixed
        );
        Db::query($sql, array($login, (int) $idDashboard, (int) $idSite, $widgetUniqueId, $period, $date));
    }

    public function clearSegment($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        Db::query(
            sprintf('UPDATE `%s` SET `segment` = NULL WHERE `login` = ? AND ' . self::EXACT_LOGIN . ' AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?', $this->tablePrefixed),
            array($login, $login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
        $this->deleteIfEmpty($login, $idDashboard, $idSite, $widgetUniqueId);
    }

    public function clearPeriod($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        Db::query(
            sprintf('UPDATE `%s` SET `period` = NULL, `date` = NULL WHERE `login` = ? AND ' . self::EXACT_LOGIN . ' AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?', $this->tablePrefixed),
            array($login, $login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
        $this->deleteIfEmpty($login, $idDashboard, $idSite, $widgetUniqueId);
    }

    private function deleteIfEmpty($login, $idDashboard, $idSite, $widgetUniqueId)
    {
        Db::query(
            sprintf("DELETE FROM `%s` WHERE `login` = ? AND " . self::EXACT_LOGIN . " AND `iddashboard` = ? AND `idsite` = ? AND `widget_uniqueid` = ?
                     AND (`segment` IS NULL OR `segment` = '') AND `period` IS NULL", $this->tablePrefixed),
            array($login, $login, (int) $idDashboard, (int) $idSite, $widgetUniqueId)
        );
    }

    /**
     * @return array<string,array{segment:?string,period:?string,date:?string}>
     */
    public function getAllForDashboard($login, $idDashboard, $idSite)
    {
        $rows = Db::fetchAll(
            sprintf('SELECT `widget_uniqueid`, `segment`, `period`, `date` FROM `%s` WHERE `login` = ? AND ' . self::EXACT_LOGIN . ' AND `iddashboard` = ? AND `idsite` = ?', $this->tablePrefixed),
            array($login, $login, (int) $idDashboard, (int) $idSite)
        );

        $map = array();
        foreach ($rows as $row) {
            $map[$row['widget_uniqueid']] = array(
                'segment' => $row['segment'],
                'period'  => $row['period'],
                'date'    => $row['date'],
            );
        }
        return $map;
    }

    /** Delete every row stored exactly under this login (another login the collation conflates keeps its rows). */
    public function deleteAllForUser($login)
    {
        Db::query(
            sprintf('DELETE FROM `%s` WHERE `login` = ? AND ' . self::EXACT_LOGIN, $this->tablePrefixed),
            array($login, $login)
        );
    }

    /**
     * The logins stored in this table that the table's collation matches for $login (it may be several, "Anna" and
     * "anna"): the user-deletion cleanup decides per stored login.
     *
     * @return string[]
     */
    public function storedLoginsMatching($login)
    {
        // no DISTINCT: it would merge "Anna" and "anna" under the collation; the exact spellings are deduplicated here
        $rows = Db::fetchAll(
            sprintf('SELECT `login` FROM `%s` WHERE `login` = ?', $this->tablePrefixed),
            array($login)
        );

        return array_values(array_unique(array_map(static function ($row) {
            return (string) $row['login'];
        }, $rows)));
    }

    /** Remove every override row for one site (all users/dashboards). Used when a site is deleted. */
    public function deleteForSite($idSite)
    {
        Db::query(
            sprintf('DELETE FROM `%s` WHERE `idsite` = ?', $this->tablePrefixed),
            array((int) $idSite)
        );
    }

    /** Remove all overrides for one dashboard (all sites). Used before re-syncing a linked dashboard. */
    public function deleteForDashboard($login, $idDashboard)
    {
        Db::query(
            sprintf('DELETE FROM `%s` WHERE `login` = ? AND ' . self::EXACT_LOGIN . ' AND `iddashboard` = ?', $this->tablePrefixed),
            array($login, $login, (int) $idDashboard)
        );
    }

    /**
     * Copy every override row of one dashboard to another (login + dashboard), across all sites. Refuses before writing
     * anything when another login, which the collation matches for $toLogin, holds one of the target keys: the insert
     * would fail with the database's duplicate key error, which names that user's login.
     */
    public function copyForDashboard($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard)
    {
        $this->assertCopyTargetNotHeldByAnotherLogin($fromLogin, $fromIdDashboard, $toLogin, $toIdDashboard);
        $rows = Db::fetchAll(
            sprintf('SELECT `idsite`, `widget_uniqueid`, `segment`, `period`, `date` FROM `%s` WHERE `login` = ? AND ' . self::EXACT_LOGIN . ' AND `iddashboard` = ?', $this->tablePrefixed),
            array($fromLogin, $fromLogin, (int) $fromIdDashboard)
        );
        $db = Db::get();
        foreach ($rows as $row) {
            $db->insert($this->tablePrefixed, array(
                'login'           => $toLogin,
                'iddashboard'     => (int) $toIdDashboard,
                'idsite'          => (int) $row['idsite'],
                'widget_uniqueid' => $row['widget_uniqueid'],
                'segment'         => $row['segment'],
                'period'          => $row['period'],
                'date'            => $row['date'],
            ));
        }
    }
}
