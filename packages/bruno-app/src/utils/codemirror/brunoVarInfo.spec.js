import { interpolate } from '@usebruno/common';
import {
  COPY_SUCCESS_TIMEOUT,
  extractVariableInfo,
  renderVarInfo,
  shouldScheduleVarInfoHideOnMouseOut
} from './brunoVarInfo';
import { getAllVariables, getVariableScope, isVariableSecret } from 'utils/collections';
import CodeMirror from 'codemirror';

// Mock the dependencies
jest.mock('@usebruno/common', () => ({
  interpolate: jest.fn(),
  mockDataFunctions: {
    randomFirstName: jest.fn(() => 'John'),
    randomLastName: jest.fn(() => 'Doe'),
    randomEmail: jest.fn(() => 'john.doe@example.com'),
    randomUUID: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000')
  }
}));

jest.mock('providers/ReduxStore', () => ({
  default: {
    dispatch: jest.fn(),
    getState: jest.fn()
  }
}));

jest.mock('providers/ReduxStore/slices/collections/actions', () => ({
  updateVariableInScope: jest.fn()
}));

jest.mock('utils/collections', () => ({
  getVariableScope: jest.fn(),
  isVariableSecret: jest.fn(),
  getAllVariables: jest.fn(),
  findEnvironmentInCollection: jest.fn()
}));

jest.mock('utils/common/codemirror', () => ({
  defineCodeMirrorBrunoVariablesMode: jest.fn()
}));

jest.mock('utils/common/masked-editor', () => ({
  MaskedEditor: jest.fn()
}));

jest.mock('utils/codemirror/autocomplete', () => ({
  setupAutoComplete: jest.fn(() => jest.fn())
}));

jest.mock('codemirror', () => {
  const CodeMirror = jest.fn((element, options) => {
    const mockEditor = {
      getValue: jest.fn(() => options.value || ''),
      setValue: jest.fn(),
      setOption: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      refresh: jest.fn(),
      focus: jest.fn(),
      getWrapperElement: jest.fn(() => element),
      getInputField: jest.fn(() => ({ blur: jest.fn() })),
      getLine: jest.fn(() => options.value || ''),
      lineCount: jest.fn(() => 1),
      setCursor: jest.fn(),
      getScrollInfo: jest.fn(() => ({ height: 20 })),
      options: options || {}
    };
    CodeMirror.mockEditor = mockEditor;
    return mockEditor;
  });
  CodeMirror.defineOption = jest.fn();
  CodeMirror.on = jest.fn();
  CodeMirror.off = jest.fn();
  CodeMirror.Init = {};
  CodeMirror.commands = {};
  return CodeMirror;
});

describe('extractVariableInfo', () => {
  let mockVariables;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock variables
    mockVariables = {
      apiKey: 'test-api-key-123',
      baseUrl: 'https://api.example.com',
      userId: 12345,
      pathParams: {
        id: 'user-123',
        slug: 'test-post'
      }
    };

    // Setup interpolate mock
    interpolate.mockImplementation((value, variables) => {
      if (typeof value === 'string' && value.includes('{{')) {
        return value.replace(/\{\{(\w+)\}\}/g, (match, key) => variables[key] || match);
      }
      return value;
    });
  });

  describe('input validation', () => {
    it('should return undefined for null input', () => {
      const result = extractVariableInfo(null, mockVariables);
      expect(result.variableName).toBeUndefined();
      expect(result.variableValue).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      const result = extractVariableInfo(undefined, mockVariables);
      expect(result.variableName).toBeUndefined();
      expect(result.variableValue).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const result = extractVariableInfo('', mockVariables);
      expect(result.variableName).toBeUndefined();
      expect(result.variableValue).toBeUndefined();
    });

    it('should return undefined for non-string input', () => {
      const result = extractVariableInfo(123, mockVariables);
      expect(result.variableName).toBeUndefined();
      expect(result.variableValue).toBeUndefined();
    });

    it('should return undefined for object input', () => {
      const result = extractVariableInfo({}, mockVariables);
      expect(result.variableName).toBeUndefined();
      expect(result.variableValue).toBeUndefined();
    });
  });

  describe('double brace format ({{variableName}})', () => {
    it('should parse double brace variables correctly', () => {
      const result = extractVariableInfo('{{apiKey}}', mockVariables);

      expect(result).toEqual({
        variableName: 'apiKey',
        variableValue: 'test-api-key-123'
      });

      expect(interpolate).toHaveBeenCalledWith('test-api-key-123', mockVariables);
    });

    it('should handle whitespace in double brace variables', () => {
      const result = extractVariableInfo('{{  apiKey  }}', mockVariables);

      expect(result).toEqual({
        variableName: 'apiKey',
        variableValue: 'test-api-key-123'
      });
    });

    it('should return undefined variableValue for non-existent double brace variable', () => {
      const result = extractVariableInfo('{{nonExistent}}', mockVariables);

      expect(result).toEqual({
        variableName: 'nonExistent',
        variableValue: undefined
      });
    });

    it('should return undefined for empty double brace variables', () => {
      const result = extractVariableInfo('{{}}', mockVariables);

      expect(result).toEqual({
        variableName: undefined,
        variableValue: undefined
      });
    });

    it('should return undefined for whitespace-only double brace variables', () => {
      const result = extractVariableInfo('{{   }}', mockVariables);

      expect(result).toEqual({
        variableName: undefined,
        variableValue: undefined
      });
    });
  });

  describe('path parameter format (/:variableName)', () => {
    it('should parse path parameter variables correctly', () => {
      const result = extractVariableInfo('/:id', mockVariables);

      expect(result).toEqual({
        variableName: 'id',
        variableValue: 'user-123'
      });
    });

    it('should return undefined for non-existent path parameter', () => {
      const result = extractVariableInfo('/:nonExistent', mockVariables);

      expect(result).toEqual({
        variableName: 'nonExistent',
        variableValue: undefined
      });
    });

    it('should handle missing pathParams object', () => {
      const variablesWithoutPathParams = { ...mockVariables };
      delete variablesWithoutPathParams.pathParams;

      const result = extractVariableInfo('/:id', variablesWithoutPathParams);

      expect(result).toEqual({
        variableName: 'id',
        variableValue: undefined
      });
    });

    it('should handle null pathParams', () => {
      const variablesWithNullPathParams = { ...mockVariables, pathParams: null };

      const result = extractVariableInfo('/:id', variablesWithNullPathParams);

      expect(result).toEqual({
        variableName: 'id',
        variableValue: undefined
      });
    });

    it('should return undefined for empty path parameters', () => {
      const result = extractVariableInfo('/:', mockVariables);

      expect(result).toEqual({
        variableName: undefined,
        variableValue: undefined
      });
    });

    it('should return undefined for whitespace-only path parameters', () => {
      const result = extractVariableInfo('/:   ', mockVariables);

      expect(result).toEqual({
        variableName: undefined,
        variableValue: undefined
      });
    });
  });

  describe('direct variable format', () => {
    it('should parse direct variable names correctly', () => {
      const result = extractVariableInfo('baseUrl', mockVariables);

      expect(result).toEqual({
        variableName: 'baseUrl',
        variableValue: 'https://api.example.com'
      });

      expect(interpolate).toHaveBeenCalledWith('https://api.example.com', mockVariables);
    });

    it('should handle numeric variable values', () => {
      const result = extractVariableInfo('userId', mockVariables);

      expect(result).toEqual({
        variableName: 'userId',
        variableValue: 12345
      });
    });

    it('should return undefined for non-existent direct variable', () => {
      const result = extractVariableInfo('nonExistent', mockVariables);

      expect(result).toEqual({
        variableName: 'nonExistent',
        variableValue: undefined
      });
    });

    it('should handle variables with special characters', () => {
      mockVariables['special-var_name'] = 'special-var_value';

      const result = extractVariableInfo('special-var_name', mockVariables);

      expect(result).toEqual({
        variableName: 'special-var_name',
        variableValue: 'special-var_value'
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty variables object', () => {
      const result = extractVariableInfo('{{apiKey}}', {});

      expect(result).toEqual({
        variableName: 'apiKey',
        variableValue: undefined
      });
    });

    it('should handle null variables object', () => {
      const result = extractVariableInfo('{{apiKey}}', null);

      expect(result).toEqual({
        variableName: 'apiKey',
        variableValue: undefined
      });
    });

    it('should handle undefined variables object', () => {
      const result = extractVariableInfo('{{apiKey}}', undefined);

      expect(result).toEqual({
        variableName: 'apiKey',
        variableValue: undefined
      });
    });
  });

  describe('return value structure', () => {
    it('should always return an object with variableName and variableValue properties', () => {
      const result = extractVariableInfo('{{apiKey}}', mockVariables);

      expect(result).toHaveProperty('variableName');
      expect(result).toHaveProperty('variableValue');
      expect(typeof result.variableName).toBe('string');
    });

    it('should return variableValue as the interpolated value', () => {
      const result = extractVariableInfo('{{apiKey}}', mockVariables);

      expect(result.variableValue).toBe('test-api-key-123');
    });
  });
});

describe('renderVarInfo', () => {
  let clipboardText = '';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // setup mock clipboard
    clipboardText = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn((text) => {
          if (text === 'cause-clipboard-error') {
            return Promise.reject(new Error('Clipboard error'));
          }

          clipboardText = text;

          return Promise.resolve();
        })
      },
      configurable: true
    });

    // mock console.error
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function setupRender(variables, collection = null, item = null) {
    const result = renderVarInfo({ string: '{{apiKey}}' }, { variables, collection, item });
    if (!result) return { result: null, containerDiv: null, valueDisplay: null, copyButton: null };

    const containerDiv = result;
    const valueDisplay =
      containerDiv.querySelector('.var-value-editable-display') || containerDiv.querySelector('.var-value-display');
    const copyButton = containerDiv.querySelector('.copy-button');

    return { result, containerDiv, valueDisplay, copyButton };
  }

  describe('popup functionality', () => {
    it('should create a popup', () => {
      const { result } = setupRender({ apiKey: 'test-value' });

      expect(result).toBeDefined();
    });

    it('should create a popup with the correct variable name and value', () => {
      const { valueDisplay } = setupRender({ apiKey: 'test-value' });

      expect(valueDisplay.textContent).toBe('test-value');
    });

    it('should correctly mask the variable value in the popup', () => {
      const { valueDisplay } = setupRender({
        apiKey: 'test-value',
        maskedEnvVariables: ['apiKey']
      });

      expect(valueDisplay.textContent).toBe('**********');
    });
  });

  describe('copy button functionality', () => {
    it('should create a copy button', () => {
      const { copyButton } = setupRender({ apiKey: 'test-value' });

      expect(copyButton).toBeDefined();
    });

    it('should copy the variable value to the clipboard', () => {
      const { copyButton } = setupRender({ apiKey: 'test-value' });

      copyButton.click();

      expect(clipboardText).toBe('test-value');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-value');
    });

    it('should copy the variable value of masked variables to the clipboard', () => {
      const { copyButton } = setupRender({ apiKey: 'test-value', maskedEnvVariables: ['apiKey'] });

      copyButton.click();

      expect(clipboardText).toBe('test-value');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-value');
    });

    it('should show a success checkmark when the variable value is copied', async () => {
      const { copyButton } = setupRender({ apiKey: 'test-value' });

      expect(copyButton.classList.contains('copy-success')).toBe(false);

      await copyButton.click();

      expect(copyButton.classList.contains('copy-success')).toBe(true);

      jest.advanceTimersByTime(COPY_SUCCESS_TIMEOUT);

      expect(copyButton.classList.contains('copy-success')).toBe(false);
    });

    it('should log to the console when the variable value is not copied', async () => {
      const { copyButton } = setupRender({ apiKey: 'cause-clipboard-error' });

      copyButton.click();

      // wait for .catch() microtask to run
      await jest.runAllTimersAsync();

      expect(clipboardText).toBe('');
      expect(console.error).toHaveBeenCalledWith('Failed to copy to clipboard:', 'Clipboard error');
    });
  });

  describe('dynamic/faker variable rendering', () => {
    function setupDynamicRender(variableName, variables = {}) {
      const result = renderVarInfo({ string: `{{${variableName}}}` }, { variables, collection: null, item: null });
      if (!result) return { result: null, containerDiv: null };

      const containerDiv = result;
      const header = containerDiv.querySelector('.var-info-header');
      const scopeBadge = containerDiv.querySelector('.var-scope-badge');
      const readOnlyNote = containerDiv.querySelector('.var-readonly-note');
      const warningNote = containerDiv.querySelector('.var-warning-note');
      const valueContainer = containerDiv.querySelector('.var-value-container');

      return { result, containerDiv, header, scopeBadge, readOnlyNote, warningNote, valueContainer };
    }

    it('should show read-only note for dynamic variables', () => {
      const { readOnlyNote } = setupDynamicRender('$randomFirstName');

      expect(readOnlyNote).not.toBeNull();
      expect(readOnlyNote.textContent).toBe('Generates random value on each request');
    });

    it('should not show value container for valid dynamic variables', () => {
      const { valueContainer } = setupDynamicRender('$randomFirstName');

      // Value is generated at runtime, so no value display
      expect(valueContainer).toBeNull();
    });

    it('should show warning for unknown dynamic variable', () => {
      const { warningNote, scopeBadge } = setupDynamicRender('$unknownFaker');

      expect(scopeBadge.textContent).toBe('Dynamic');
      expect(warningNote).not.toBeNull();
      expect(warningNote.textContent).toContain('Unknown dynamic variable');
    });
  });

  describe('OAuth2 variable rendering', () => {
    function setupOAuth2Render(variableName, variables = {}) {
      const result = renderVarInfo({ string: `{{${variableName}}}` }, { variables, collection: null, item: null });
      if (!result) return { result: null, containerDiv: null };

      const containerDiv = result;
      const header = containerDiv.querySelector('.var-info-header');
      const scopeBadge = containerDiv.querySelector('.var-scope-badge');
      const readOnlyNote = containerDiv.querySelector('.var-readonly-note');
      const warningNote = containerDiv.querySelector('.var-warning-note');
      const valueContainer = containerDiv.querySelector('.var-value-container');
      const valueDisplay = containerDiv.querySelector('.var-value-display');

      return { result, containerDiv, header, scopeBadge, readOnlyNote, warningNote, valueContainer, valueDisplay };
    }

    it('should show OAuth2 scope badge for $oauth2 variables', () => {
      const { scopeBadge } = setupOAuth2Render('$oauth2.credentials.access_token', {
        '$oauth2.credentials.access_token': 'test-token-123'
      });

      expect(scopeBadge.textContent).toBe('OAuth2');
    });

    it('should show read-only note for valid OAuth2 variables', () => {
      const { readOnlyNote } = setupOAuth2Render('$oauth2.credentials.access_token', {
        '$oauth2.credentials.access_token': 'test-token-123'
      });

      expect(readOnlyNote).not.toBeNull();
      expect(readOnlyNote.textContent).toBe('read-only');
    });

    it('should display the token value for valid OAuth2 variables', () => {
      const { valueDisplay } = setupOAuth2Render('$oauth2.credentials.access_token', {
        '$oauth2.credentials.access_token': 'test-token-123'
      });

      expect(valueDisplay).not.toBeNull();
      expect(valueDisplay.textContent).toBe('test-token-123');
    });

    it('should show warning for OAuth2 variable when token is not found', () => {
      const { warningNote, scopeBadge } = setupOAuth2Render('$oauth2.credentials.access_token', {});

      expect(scopeBadge.textContent).toBe('OAuth2');
      expect(warningNote).not.toBeNull();
      expect(warningNote.textContent).toContain('OAuth2 token not found');
    });
  });

  describe('Win+V / OS overlay edit mode', () => {
    // Win+V (Windows clipboard history) cannot be e2e'd on Linux CI.
    let hasFocusSpy;

    const enterEditMode = () => {
      interpolate.mockImplementation((value) => value ?? '');
      getVariableScope.mockReturnValue({
        type: 'environment',
        value: 'test-value',
        data: { variable: { name: 'apiKey', value: 'test-value' } }
      });
      getAllVariables.mockReturnValue({ apiKey: 'test-value' });
      isVariableSecret.mockReturnValue(false);

      const { containerDiv, valueDisplay } = setupRender(
        { apiKey: 'test-value' },
        { uid: 'col-1' },
        { uid: 'item-1', type: 'http-request' }
      );

      valueDisplay.click();
      jest.runAllTimers();

      const editorContainer = containerDiv.querySelector('.var-value-editor');
      const blurHandler = CodeMirror.mockEditor.on.mock.calls.find((call) => call[0] === 'blur')[1];

      return { containerDiv, valueDisplay, editorContainer, blurHandler, cmEditor: CodeMirror.mockEditor };
    };

    beforeEach(() => {
      hasFocusSpy = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    });

    afterEach(() => {
      hasFocusSpy.mockRestore();
    });

    it('does not exit edit mode when document.hasFocus() is false', () => {
      const { valueDisplay, editorContainer, blurHandler } = enterEditMode();

      expect(editorContainer.style.display).toBe('block');
      expect(valueDisplay.style.display).toBe('none');

      hasFocusSpy.mockReturnValue(false);
      blurHandler();

      expect(editorContainer.style.display).toBe('block');
      expect(valueDisplay.style.display).toBe('none');
    });

    it('re-focuses the inner editor when the window regains focus after OS overlay blur', () => {
      const { blurHandler, cmEditor } = enterEditMode();

      hasFocusSpy.mockReturnValue(false);
      blurHandler();

      hasFocusSpy.mockReturnValue(true);
      window.dispatchEvent(new Event('focus'));

      expect(cmEditor.focus).toHaveBeenCalled();
    });

    it('exits edit mode on in-app blur', () => {
      const { valueDisplay, editorContainer, blurHandler } = enterEditMode();

      hasFocusSpy.mockReturnValue(true);
      blurHandler();

      expect(editorContainer.style.display).toBe('none');
      expect(valueDisplay.style.display).toBe('block');
    });
  });
});

describe('shouldScheduleVarInfoHideOnMouseOut', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not schedule hide while the document is unfocused (OS overlay / Win+V)', () => {
    // Win+V cannot be e2e'd on Linux CI.
    jest.spyOn(document, 'hasFocus').mockReturnValue(false);

    expect(shouldScheduleVarInfoHideOnMouseOut()).toBe(false);
  });

  it('schedules hide when the document is focused (in-app mouseout)', () => {
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);

    expect(shouldScheduleVarInfoHideOnMouseOut()).toBe(true);
  });
});
