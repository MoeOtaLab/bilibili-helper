"use strict";
// ==UserScript==
// @name                bilibili Helper
// @name:zh-CN          bilibili 助手
// @description         Auto disable bilibili HTML5 player danmaku. Auto widescreen. Add hotkeys（d: toggle danmaku）. Can override by configuration.
// @description:zh-CN   自动关闭哔哩哔哩 HTML5 播放器弹幕，自动宽屏，添加快捷键（d:弹幕切换）.可通过配置修改默认行为
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
        left: 50%;
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
        box-shadow: 0 0 8px #e5e9ef;
        color: #212121;
      }

      .title {
        margin-bottom: 16px;
        text-align: center;
        line-height: 22px;
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

      .footer {
        margin-block-start: 16px;
        text-align: center;
      }

      .footer button {
        background: none;
        border: none;
        cursor: pointer;
        min-width: 100px;
        background: #f4f4f4;
        line-height: 22px;
        border-radius: 2px;

        transition: color cubic-bezier(0.215, 0.610, 0.355, 1) .25s,
          background-color cubic-bezier(0.215, 0.610, 0.355, 1) .25s;
      }

      .footer button:hover {
        color: #00a1d6;
      }

      .footer button:active {
        background-color: #e7e7e7;
      }
    `

    const div = document.createElement('div')
    div.innerHTML = `
      <div class="dialog">
        <div class="title">Bilibili Helper Configuration</div>
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

          <div>
            <label for="registerHotKeys"> 启动热键 [d - 切换弹幕] [w - 切换宽屏] </label>
            <select id="registerHotKeys">
              <option value="on">启用</option>
              <option value="off">不启用</option>
            </select>
          </div>
        </form>
        <div class="footer"><button id="confirm">确定</button></div>
      </div>
    `

    this.shadowRoot.append(style, div)
    this.handleClickOutside = this.handleClickOutside.bind(this)
    this.closeDialog = this.closeDialog.bind(this)
    this.openDialog = this.openDialog.bind(this)

    const confirmButton = div.querySelector('#confirm')
    confirmButton.addEventListener('click', () => {
      this.close()
    })
  }

  get data() {
    return this._value
  }

  set data(value) {
    this._value = value
    this.resetFormValues();
  }

  connectedCallback() {
    document.addEventListener('click', this.handleClickOutside, false)
  }

  disconnectedCallback() {
    document.removeEventListener('click', this.handleClickOutside, false)
  }

  handleClickOutside(event) {
    if (event.target !== this) {
      this.close();
    }
  }

  get form() {
    return this.shadowRoot.querySelector('form')
  }

  close = () => {
    this.setAttribute('open', '')
  }


  closeDialog() {
    const dialog = this.shadowRoot.querySelector('.dialog');
    dialog && dialog.classList.remove('show');
    if (this.ready) {
      const value = Object.fromEntries([...this.form.elements].map(el => [el.id, el.value]))
      this.data = value
      this.dispatchEvent(new Event('change'))
    }
  }

  openDialog() {
    const dialog = this.shadowRoot.querySelector('.dialog')
    dialog && dialog.classList.add('show')
  }

  resetFormValues() {
    const data = this.data;
    [...this.form.elements].forEach((el) => {
      el.value = data[el.id];
    })
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'open') {
      if (newValue) {
        this.openDialog();
      } else {
        this.closeDialog();
      }
    }
    this.ready = true;
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
    registerHotKeys: 'on', // on - off
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
  function setScreenStatus(defaultScreenStatus = config.defaultScreenStatus) {
    switch (defaultScreenStatus) {
      case 'widescreen':
        return autoClickElements(['button[data-text="宽屏模式"]', '.squirtle-video-widescreen:not(.active)'])
      case 'fullscreen':
        return autoClickElements(['button[data-text="进入全屏"]', '.squirtle-video-fullscreen:not(.active)'])
      case 'default':
      default:
        return;
    }
  }

  /** register hotkeys */
  function registerHotKeys() {
    if (config.registerHotKeys === 'off') {
      return;
    }

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
          return autoClickElements(['button[data-text="宽屏模式"]', '.squirtle-video-widescreen'])
        case 'toggleFullscreen':
          return autoClickElements(['button[data-text="进入全屏"]', '.squirtle-video-fullscreen'])
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
        panel.data = {
          ...config
        }
        panel.setAttribute('open', 'true');
      }
    }, 'openConfig')

    panel.addEventListener('change', (event) => {
      try {
        const value = event.target.data
        Object.assign(config, value);
      } catch (error) {
        // ignore
      }
    })

    document.body.append(panel);
  }

  async function showPlayList() {
    const style = document.createElement('style')
    document.body.append(style)
    if (style.sheet) {
      style.sheet.addRule('.squirtle-pagelist-wrap', 'display: flex !important; align-items: center;')
      style.sheet.addRule('.squirtle-wide-screen .squirtle-pagelist-wrap', 'display: block !important;')
    }
  }

  function main() {
    setDefaultDanmakuStatus();
    setScreenStatus();
    registerHotKeys();
    createPanel();
    showPlayList();
  }

  main();
})();