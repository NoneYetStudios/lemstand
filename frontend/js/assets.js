/**
 * Lemonade Stand - Visual Mode Artwork & Weather Icon Registry
 * Provides mode-specific artwork for Retro (Apple ][e phosphor), 8-bit (Pixel sprites), and Modern (SVG).
 */
(function (root) {
  'use strict';

  const WEATHER_KEYS = ['sunny', 'cloudy', 'hot_dry', 'thunderstorms', 'heatwave', 'cold_snap'];

  const ASCII_WEATHER = {
    sunny: [
      '    \\   |   /    ',
      '  .  *-----*  .  ',
      ' --- /     \\ --- ',
      '     \\     /     ',
      '  .  *-----*  .  ',
      '    /   |   \\    '
    ].join('\n'),
    cloudy: [
      '      .--.       ',
      '   .-(    ).     ',
      '  (___.__)__)    ',
      '    . . . .      ',
      '  CLOUD COVER    '
    ].join('\n'),
    hot_dry: [
      '   \\  |  /   ||  ',
      ' -- (HOT) -- ||  ',
      '   /  |  \\   ||  ',
      ' ~~~~~~~~~~~ (O) ',
      '  ARID & DRY     '
    ].join('\n'),
    thunderstorms: [
      '     .-~~~-.     ',
      '  .-(       )-.  ',
      ' (_____________) ',
      '    //  /_  //   ',
      '   //   /  //    '
    ].join('\n'),
    heatwave: [
      '  \\ \\ | | / /   ',
      ' == (99+ F) ==  ',
      ' ~~~~~~~~~~~~~~  ',
      ' ~~~~~~~~~~~~~~  ',
      ' EXTREME HEAT!   '
    ].join('\n'),
    cold_snap: [
      '    \\  |  /      ',
      '  -- *+*+* --    ',
      '    /  |  \\      ',
      '  * BRRRRRR *    ',
      '  CHILLY SNAP    '
    ].join('\n')
  };

  const ASCII_STAND = [
    '  ====================================  ',
    '  ||     APPLE ][e LEMONADE CO.     ||  ',
    '  ====================================  ',
    '     ||                          ||     ',
    '     ||     [ ]   (_)   [ ]      ||     ',
    '  ====================================  ',
    '  |  FRESH ICE COLD LEMONADE TODAY!  |  ',
    '  ====================================  '
  ].join('\n');

  /**
   * Return an HTML string for the weather icon matching the current visual theme.
   */
  function getWeatherIconHtml(weatherKey, themeMode = 'modern', sizeClass = 'w-16 h-16') {
    const key = WEATHER_KEYS.includes(weatherKey) ? weatherKey : 'sunny';

    if (themeMode === 'retro') {
      return `
        <div class="flex flex-col items-center justify-center">
          <img src="/assets/icons/retro/${key}.svg" alt="${key} retro icon" class="${sizeClass} mb-1" />
          <pre class="text-[11px] leading-tight hidden sm:block font-mono select-none">${ASCII_WEATHER[key]}</pre>
        </div>
      `;
    }

    if (themeMode === '8-bit') {
      return `
        <img src="/assets/icons/pixel/${key}.svg" alt="${key} 8-bit sprite" class="${sizeClass}" style="image-rendering: pixelated;" />
      `;
    }

    return `
      <img src="/assets/icons/svg/${key}.svg" alt="${key} weather icon" class="${sizeClass} drop-shadow-sm" />
    `;
  }

  /**
   * Return an HTML string for the Lemonade Stand hero banner matching the current visual theme.
   */
  function getStandHeroHtml(themeMode = 'modern', standName = 'YOUR STAND') {
    const safeStand = String(standName || 'LEMONADE STAND').replace(/[<>&"']/g, '');

    if (themeMode === 'retro') {
      const name = safeStand.slice(0, 32);
      const padTotal = Math.max(0, 32 - name.length);
      const padLeft = Math.floor(padTotal / 2);
      const padRight = padTotal - padLeft;
      const signText = ' '.repeat(padLeft) + name + ' '.repeat(padRight);
      const standArt = ASCII_STAND.replace('     APPLE ][e LEMONADE CO.     ', signText);

      return `
        <div class="p-3 border border-[#33ff33] bg-[#020802] text-center overflow-x-auto">
          <pre class="text-xs sm:text-sm leading-tight inline-block text-left text-[#33ff33]">${standArt}</pre>
        </div>
      `;
    }

    if (themeMode === '8-bit') {
      return `
        <div class="flex items-center justify-center gap-4 p-3 bg-[#181425] border-2 border-[#ffcd75]">
          <img src="/assets/icons/pixel/stand.svg" alt="8-bit Stand Sprite" class="w-14 h-14" style="image-rendering: pixelated;" />
          <div class="text-left">
            <div class="text-xs text-[#ffcd75] uppercase tracking-wider">${safeStand}</div>
            <div class="text-[10px] text-[#94b0c2] mt-1">8-BIT ARCADE EDITION</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="flex items-center justify-center gap-4 p-3 rounded-xl bg-amber-50/90 border border-amber-200/80">
        <img src="/assets/icons/svg/stand.svg" alt="Modern Stand Illustration" class="w-14 h-14 drop-shadow" />
        <div class="text-left">
          <div class="text-base font-extrabold text-slate-900">${safeStand}</div>
          <div class="text-xs font-medium text-amber-800">Fresh Squeezed Neighborhood Stand</div>
        </div>
      </div>
    `;
  }

  root.LemonadeAssets = {
    WEATHER_KEYS,
    ASCII_WEATHER,
    ASCII_STAND,
    getWeatherIconHtml,
    getStandHeroHtml
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
