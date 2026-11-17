<?php

/**
 * Matomo - free/libre analytics platform
 *
 * @link    https://matomo.org
 * @license https://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

namespace Piwik\Plugins\FeinwerkDashboardSegment\Exception;

use Piwik\Http\HttpCodeException;

/**
 * A widget setting key that another Matomo user holds (two logins the database compares as equal): the save is refused
 * with HTTP 409, and the message names no login.
 */
class StoredForAnotherUserException extends \Exception implements HttpCodeException
{
    public function __construct()
    {
        parent::__construct('This widget setting is stored for another user.', 409);
    }
}
