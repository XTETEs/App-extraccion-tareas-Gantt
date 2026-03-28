import { describe, it, expect, vi, beforeEach } from 'vitest';
import handler from './upload.js';
import { put } from '@vercel/blob';

// Mock the dependencies
vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}));

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      sadd = vi.fn();
    },
  };
});

describe('upload handler', () => {
  let mockRequest;
  let mockResponse;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      url: 'http://localhost/api/upload?filename=test.xlsx',
      headers: { host: 'localhost' },
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Silence console.error and console.log for clean test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should return 400 if filename is missing', async () => {
    mockRequest.url = 'http://localhost/api/upload';

    await handler(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Filename is required' });
  });

  it('should successfully upload and return 200', async () => {
    const mockBlob = { url: 'https://blob.vercel-storage.com/test.xlsx' };
    vi.mocked(put).mockResolvedValue(mockBlob);

    await handler(mockRequest, mockResponse);

    expect(put).toHaveBeenCalledWith('test.xlsx', mockRequest, { access: 'public' });
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(mockBlob);
  });

  it('should return 500 if upload fails and catch the error', async () => {
    const error = new Error('Vercel Blob failed');
    vi.mocked(put).mockRejectedValue(error);

    await handler(mockRequest, mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: 'Vercel Blob failed',
      details: 'Error: Vercel Blob failed'
    });
    expect(console.error).toHaveBeenCalledWith('[upload] Error:', error);
  });
});
