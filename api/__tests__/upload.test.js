import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { put } from '@vercel/blob';

vi.mock('@vercel/blob', () => ({
  put: vi.fn()
}));

vi.mock('@upstash/redis', () => {
  const mockSadd = vi.fn();
  class MockRedis {
    constructor() {
      this.sadd = mockSadd;
    }
  }
  return {
    Redis: MockRedis
  };
});

describe('upload handler', () => {
  let mockRequest;
  let mockResponse;
  let statusMock;
  let jsonMock;
  let handler;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Suppress console output during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // We import dynamically to allow mock setups before initialization
    handler = (await import('../upload.js')).default;

    jsonMock = vi.fn();
    statusMock = vi.fn(() => ({ json: jsonMock }));

    mockResponse = {
      status: statusMock
    };

    mockRequest = {
      url: 'http://localhost/api/upload?filename=test.txt',
      headers: { host: 'localhost' }
    };
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('handles missing filename with 400', async () => {
    mockRequest.url = 'http://localhost/api/upload';

    await handler(mockRequest, mockResponse);

    expect(statusMock).toHaveBeenCalledWith(400);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Filename is required' });
  });

  it('handles successful upload with 200', async () => {
    const mockBlob = { url: 'https://blob.vercel-storage.com/test.txt' };
    vi.mocked(put).mockResolvedValueOnce(mockBlob);

    await handler(mockRequest, mockResponse);

    expect(put).toHaveBeenCalledWith('test.txt', mockRequest, { access: 'public' });
    expect(statusMock).toHaveBeenCalledWith(200);
    expect(jsonMock).toHaveBeenCalledWith(mockBlob);
  });

  it('handles upload failure with 500 error structure', async () => {
    const errorMessage = 'Storage limit exceeded';
    const error = new Error(errorMessage);
    vi.mocked(put).mockRejectedValueOnce(error);

    await handler(mockRequest, mockResponse);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[upload] Error:', error);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      error: errorMessage,
      details: error.toString()
    });
  });

  it('handles upload failure with string error', async () => {
    const error = 'String error message';
    vi.mocked(put).mockRejectedValueOnce(error);

    await handler(mockRequest, mockResponse);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[upload] Error:', error);
    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'Upload failed',
      details: error.toString()
    });
  });
});
