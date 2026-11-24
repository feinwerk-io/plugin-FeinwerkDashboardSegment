/*
 * Feinwerk kit: the connector installer page. One click only: the button turns into a progress label and ignores
 * further clicks while Matomo downloads and activates the connector (a plain link otherwise starts a second run).
 * Every Feinwerk plugin ships this file and Matomo merges all copies: window.fwciKit lets only the first copy bind,
 * otherwise the second handler saw the first one's aria-disabled and cancelled the navigation (release review
 * 2026-11-24).
 */
(function ($) {
    'use strict';
    var VERSION = 1;
    if ((window.fwciKit || 0) >= VERSION) {
        return;
    }
    window.fwciKit = VERSION;
    $(document).on('click', '.fwci__run', function (ev) {
        var $run = $(this);
        if ($run.attr('aria-disabled') === 'true') {
            ev.preventDefault();
            return;
        }
        var busy = $run.attr('data-fwci-busy');
        $run.attr('aria-disabled', 'true').addClass('fwci__run--busy');
        if (busy) {
            $run.text(busy);
        }
        $run.closest('.fwci').attr('aria-busy', 'true');
    });
})(jQuery);
