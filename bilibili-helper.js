"use strict";
// ==UserScript==
// @name                bilibili Helper
// @name:zh-CN          bilibili 助手
// @description         Auto disable bilibili HTML5 player danmaku. Auto widescreen. Add hotkeys（d: toggle danmaku, c: give coins, s: add collections）.
// @description:zh-CN   自动关闭哔哩哔哩 HTML5 播放器弹幕，自动宽屏，添加快捷键（d:弹幕切换，c：投币，s：收藏）.
// @namespace           bilibili-helper
// @version             2021.08.29
// @author              everbrez
// @license             MIT License
// @match               *://www.bilibili.com/video/*
// @match               *://www.bilibili.com/bangumi/play/*
// @match               *://www.bilibili.com/blackboard/*
// @match               *://www.bilibili.com/watchlater/*
// @match               *://player.bilibili.com/*
// ==/UserScript==

/** START: utils */
/**
 * wait for an element to render
 * @usage
 * const targetElement = await waitForElement('.target')
 * // then do something
 * if the rootElement is not exist, waitForElement will throw an error
 *
 * @param {string} targetSelector the target element query selector
 * @param {string} [rootSelector='body'] default search root element: body
 * @param {number} [wait] how long to cancal watch this element to render, default: wait forever
 * @returns {Promise<Element>} return the target element dom object
 */
function waitForElement(targetSelector, rootSelector = 'body', wait) {
  const rootElement = document.querySelector(rootSelector);
  if (!rootElement) {
    console.log('root element is not exist');
    return Promise.reject('root element is not exist');
  }
  // check if the element is already rendered
  const targetElement = rootElement.querySelector(targetSelector);
  if (targetElement) {
    return Promise.resolve(targetElement);
  }
  return new Promise((resolve, reject) => {
    const callback = function (matationList, observer) {
      const targetElement = rootElement.querySelector(targetSelector);
      if (targetElement) {
        // found
        resolve(targetElement);
        // then cancel to watch the element
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(callback);
    observer.observe(rootElement, {
      subtree: true,
      childList: true
    });
    if (wait !== undefined) {
      // if wait is set, then cancel to watch the element to render after wait times
      setTimeout(() => {
        observer.disconnect();
      }, wait);
    }
  });
}

async function autoClickElement(targetSelector, rootSelector, now = false) {
  console.log('set==> ', targetSelector)
  if (now) {
    const parent = rootSelector ? document.querySelector(rootSelector) : document;
    if (parent) {
      const target = parent.querySelector(targetSelector);
      if (target) {
        target.click();
        return true;
      }
    }
    return false;
  }
  const target = await waitForElement(targetSelector, rootSelector);
  console.log('auto click:', target)
  target.click();
}

function autoClickElements(selectorList) {
  return Promise.race(selectorList.map(selector => autoClickElement(selector)))
}

function detectIsInputing() {
  const activeElement = document.activeElement;
  return activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement;
}

function getStorageConfig(key) {
  try {
    const data = JSON.parse(key)
    if (data instanceof Object) {
      return data
    }
  } catch (error) {
    // ignore..
  } finally {
    return null
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
/** END: utils */
(function () {
  /** global config */
  const DEFAULT_CONFIG_KEY = 'BILIBILI_HELPER_CONFIG'
  const defaultConfig = {
    defaultDanmakuStatus: 'off', // on,off,default
    defaultScreenStatus: 'widescreen', // widescreen,fullscreen,default
    showEpisodesWhenWidescreen: 'on', // on - off
    fixAutoJumpPv: 'on', // on - off
    // type: 'toggleDanmaku' | 'toggleWidescreen' | 'toggleFullscreen' | 'next' | 'prev' | 'toggleSubtitle'
    hotKeys: [{
      type: 'toggleDanmaku',
      keys: ['d']
    }, {
      type: 'toggleWidescreen',
      keys: ['w']
    }, {
      type: 'toggleFullscreen',
      keys: [], // use default 'f' provided by bilibili official
    }, {
      type: 'next',
      keys: [],
    }, {
      type: 'prev',
      keys: [],
    }, {
      type: 'toggleSubtitle',
      keys: [],
    }],
  }

  const _config = getStorageConfig(DEFAULT_CONFIG_KEY) || defaultConfig;

  const config = new Proxy(_config, {
    set(target, prop, value, receiver) {
      localStorage.setItem(DEFAULT_CONFIG_KEY, _config)
      return Reflect.set(target, prop, value, receiver)
    }
  })

  async function autoClickElementAfterFound(targetSelector, foundSelector) {
    await waitForElement(foundSelector)
    // await for bilibili initial process
    await sleep(1000)
    autoClickElement(targetSelector)
  }

  /** set danmaku status */
  function setDefaultDanmakuStatus() {
    switch (config.defaultDanmakuStatus) {
      case 'on':
        console.log('===on===')
        return autoClickElementAfterFound('input.bui-switch-input:not(:checked)', 'input.bui-switch-input')
      case 'default':
        return;
      case 'off':
      default:
        console.log('===off===', document.querySelector('input.bui-switch-input:checked'))
        return autoClickElementAfterFound('input.bui-switch-input:checked', 'input.bui-switch-input')
    }
  }

  /** set screen status */
  function setScreenStatus() {
    switch (config.defaultScreenStatus) {
      case 'widescreen':
        return autoClickElements(['button[data-text="宽屏模式"]', '.squirtle-video-widescreen:not(.active)'])
        // case 'fullscreen':
        //   return ['button[data-text="进入全屏"]', '.squirtle-video-fullscreen:not(.active)'].forEach(selector => autoClickElement(selector))
      case 'default':
      default:
        return;
    }
  }

  /** register hotkeys */
  function registerHotKeys() {
    document.addEventListener('keypress', async (event) => {
      const isInputing = detectIsInputing();
      if (isInputing) {
        return;
      }

      const targetHotKeys = config.hotKeys.find(item => item.keys.includes(event.key))

      switch (targetHotKeys.type) {
        case 'toggleDanmaku':
          return autoClickElement('input.bui-switch-input');
        case 'toggleWidescreen':
          return autoClickElements(['button[data-text="宽屏模式"]', '.squirtle-video-fullscreen:not(.active)'])
        case 'toggleFullscreen':
          return autoClickElements(['button[data-text="宽屏模式"]', '.squirtle-video-fullscreen:not(.active)'])
      }
    });
  }

  function main() {
    setDefaultDanmakuStatus();
    setScreenStatus();
    registerHotKeys();
  }

  main();
})();