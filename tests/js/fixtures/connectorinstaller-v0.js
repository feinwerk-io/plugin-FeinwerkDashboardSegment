/*
 * Feinwerk kit: the connector installer page. One click only: the button turns into a progress label and ignores
 * further clicks while Matomo downloads and activates the connector (a plain link otherwise starts a second run).
 */
(function ($) {
    'use strict';
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
