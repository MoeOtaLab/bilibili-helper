"use strict";
// ==UserScript==
// @name                bilibili Helper2
// @name:zh-CN          bilibili 助手
// @description         Auto disable bilibili HTML5 player danmaku. Auto widescreen. Add hotkeys（d: toggle danmaku, c: give coins, s: add collections）.
// @description:zh-CN   自动关闭哔哩哔哩 HTML5 播放器弹幕，自动宽屏，添加快捷键（d:弹幕切换，c：投币，s：收藏）.
// @namespace           bilibili-helper
// @version             2021.08.29
// @author              everbrez
// @license             MIT License
// @grant               unsafeWindow
// @grant               GM_registerMenuCommand
// @grant               GM_setValue
// @grant               GM_getValue
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
  let data = null
  try {
    const rawData = localStorage.getItem(key)
    const parseData = JSON.parse(rawData)
    if (parseData instanceof Object) {
      data = parseData;
    }
  } catch (error) {
    // ignore..
    console.error(error)
  } finally {
    return data
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
/** END: utils */

/** panel element */
class ConfigPanel extends HTMLElement {
  static get observedAttributes() {
    return ['open', 'value'];
  }

  constructor() {
    super()
    this._value = {}
    this.ready = false
    this.attachShadow({
      mode: 'open'
    })

    const style = document.createElement('style')
    style.innerHTML = `
      .dialog {
        position: fixed;
        right: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
    
        display: grid;
        align-items: center;
        justify-content: end;

        padding: 16px;

        background: white;
        border-radius: 4px;
        overflow: hidden;

        font-size: 14px;
      }

      .dialog:not(.show) {
        display: none;
      }

      .panel {
        display: grid;
        grid-auto-flow: row;
        gap: 8px;
      }
    
      .panel>div {
        display: grid;
        grid-auto-flow: column;
        justify-content: start;
        gap: 8px;
      }
    
      .panel select {
        border: none;
        cursor: pointer;
      }
    `

    const div = document.createElement('div')
    div.innerHTML = `
      <div class="dialog">
        <form class="panel">
          <div>
            <label for="defaultDanmakuStatus"> 默认弹幕状态 </label>
            <select id="defaultDanmakuStatus">
              <option value="on">开启</option>
              <option value="off">关闭</option>
              <option value="default">默认</option>
            </select>
          </div>
        
          <div>
            <label for="defaultScreenStatus"> 默认屏幕状态 </label>
            <select id="defaultScreenStatus">
              <option value="widescreen">宽屏</option>
              <option value="default">默认</option>
            </select>
          </div>
        </form>
      </div>
    `

    this.shadowRoot.append(style, div)
    this.handleClickOutside = this.handleClickOutside.bind(this)
    this.closeDialog = this.closeDialog.bind(this)
    this.openDialog = this.openDialog.bind(this)
  }

  connectedCallback() {
    document.addEventListener('click', this.handleClickOutside, false)
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.handleClickOutside, false)
  }

  handleClickOutside(event) {
    if (event.target !== this) {
      this.closeDialog();
    }
  }

  get form() {
    return this.shadowRoot.querySelector('form')
  }


  closeDialog() {
    const dialog = this.shadowRoot.querySelector('.dialog');
    dialog && dialog.classList.remove('show');
    if (this.ready) {
      const value = Object.fromEntries([...this.form.elements].map(el => [el.id, el.value]))
      this.value = JSON.stringify(value)
      this.dispatchEvent(new Event('change'))
    }
  }

  openDialog() {
    const dialog = this.shadowRoot.querySelector('.dialog')
    dialog && dialog.classList.add('show')
  }

  resetFormValues() {
    [...this.form.elements].forEach((el) => {
      el.value = this._value[el.id];
    })
  }

  attributeChangedCallback(name, oldValue, newValue) {
    this.ready = true;
    if (name === 'open') {
      if (newValue) {
        this.openDialog();
      } else {
        this.closeDialog();
      }
    }

    if (name === 'value') {
      try {
        const currentValue = JSON.parse(newValue);
        // this. = currentValue;
        if (currentValue instanceof Object) {
          this._value = currentValue
          this.resetFormValues();
        }
      } catch (error) {
        // ignore
      }
    }
  }
}

/** end panel element */
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

  const _config = Object.assign({
    ...defaultConfig
  }, getStorageConfig(DEFAULT_CONFIG_KEY) || {});

  const config = new Proxy(_config, {
    set(target, prop, value, receiver) {
      const res = Reflect.set(target, prop, value, receiver)
      localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(_config, undefined, 2))
      return res;
    },
  });

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
        return autoClickElementAfterFound('input.bui-switch-input:not(:checked)', 'input.bui-switch-input')
      case 'default':
        return;
      case 'off':
      default:
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

  /** create panel */
  function createPanel() {
    unsafeWindow.customElements.define('bilibili-helper-panel', ConfigPanel);
    const panel = document.createElement('bilibili-helper-panel');
    GM_registerMenuCommand('打开配置', (...args) => {
      const currentStatus = panel.getAttribute('open');
      if (currentStatus) {
        panel.setAttribute('open', '');
      } else {
        panel.setAttribute('open', 'true');
        panel.setAttribute('value', JSON.stringify(config));
      }
    }, 'openConfig')

    panel.addEventListener('change', (event) => {
      try {
        const value = JSON.parse(event.target.value);
        Object.assign(config, value);
      } catch (error) {
        // ignore
      }
    })

    document.body.append(panel);
  }

  function main() {
    setDefaultDanmakuStatus();
    setScreenStatus();
    registerHotKeys();
    createPanel();
  }

  main();
})();