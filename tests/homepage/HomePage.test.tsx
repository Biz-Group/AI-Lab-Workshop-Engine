// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next/navigation
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

import HomePage from '@/app/page';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders brand logo dots and name', () => {
      render(<HomePage />);
      expect(screen.getByText('The AI Lab')).toBeTruthy();
      expect(screen.getByText('by Biz Group')).toBeTruthy();
    });

    it('renders facilitator login link pointing to /auth/login', () => {
      render(<HomePage />);
      const link = screen.getByText('Facilitator log in');
      expect(link.closest('a')).toBeTruthy();
      expect(link.closest('a')!.getAttribute('href')).toBe('/auth/login');
    });

    it('renders hero heading and subtitle', () => {
      render(<HomePage />);
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
      expect(screen.getByText(/Four characters/)).toBeTruthy();
      expect(screen.getByText(/Self-paced prompt building/)).toBeTruthy();
    });

    it('renders eyebrow text', () => {
      render(<HomePage />);
      expect(screen.getByText('Your session is waiting')).toBeTruthy();
    });

    it('renders join card with title and subtitle', () => {
      render(<HomePage />);
      expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
      expect(screen.getByText('Enter your join code')).toBeTruthy();
      expect(screen.getByText(/on screen or shared by your facilitator/)).toBeTruthy();
    });

    it('renders 4 character inputs with correct aria-labels', () => {
      render(<HomePage />);
      for (let i = 1; i <= 4; i++) {
        expect(screen.getByLabelText(`Join code character ${i}`)).toBeTruthy();
      }
    });

    it('renders helper text about code format', () => {
      render(<HomePage />);
      expect(screen.getByText(/letters and numbers, no spaces/)).toBeTruthy();
    });

    it('renders join button', () => {
      render(<HomePage />);
      expect(screen.getByRole('button', { name: /Join workshop/i })).toBeTruthy();
    });
  });

  describe('input behavior', () => {
    it('auto-advances focus to next input on typing', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;

      act(() => { input1.focus(); });
      fireEvent.change(input1, { target: { value: 'K' } });

      expect(input1.value).toBe('K');
      expect(document.activeElement).toBe(input2);
    });

    it('backspace on empty input moves focus to previous', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;

      // Fill first, advance to second
      fireEvent.change(input1, { target: { value: 'K' } });
      act(() => { input2.focus(); });

      // Backspace on empty second input
      fireEvent.keyDown(input2, { key: 'Backspace' });

      expect(input1.value).toBe('');
      expect(document.activeElement).toBe(input1);
    });

    it('backspace on filled input clears it without moving focus', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      fireEvent.change(input1, { target: { value: 'K' } });
      act(() => { input1.focus(); });
      fireEvent.keyDown(input1, { key: 'Backspace' });

      expect(input1.value).toBe('');
      expect(document.activeElement).toBe(input1);
    });

    it('distributes pasted text across all inputs', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      act(() => { input1.focus(); });
      // Simulate paste by setting multi-char value
      fireEvent.change(input1, { target: { value: 'K7RM' } });

      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;
      const input3 = screen.getByLabelText('Join code character 3') as HTMLInputElement;
      const input4 = screen.getByLabelText('Join code character 4') as HTMLInputElement;

      expect(input1.value).toBe('K');
      expect(input2.value).toBe('7');
      expect(input3.value).toBe('R');
      expect(input4.value).toBe('M');
    });

    it('rejects invalid characters (I, O, 0, 1)', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      act(() => { input1.focus(); });
      fireEvent.change(input1, { target: { value: 'I' } });
      expect(input1.value).toBe('');

      fireEvent.change(input1, { target: { value: '0' } });
      expect(input1.value).toBe('');

      fireEvent.change(input1, { target: { value: 'A' } });
      expect(input1.value).toBe('A');
    });

    it('converts input to uppercase', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      fireEvent.change(input1, { target: { value: 'k' } });
      expect(input1.value).toBe('K');
    });
  });

  describe('form submission', () => {
    it('focuses first empty cell when submitting incomplete code', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      fireEvent.change(input1, { target: { value: 'K' } });
      // input2 is empty, input3 and 4 are empty

      fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);

      expect(document.activeElement).toBe(screen.getByLabelText('Join code character 2'));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('calls verify API with the entered code on submit', async () => {
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { sessionId: '123' } }),
      });

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      // Fill all inputs
      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      // Submit
      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      expect(fetchMock).toHaveBeenCalledWith('/api/sessions/verify?code=K7RM');
    });

    it('navigates to /join/CODE on successful verify', async () => {
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { sessionId: '123' } }),
      });

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith('/join/K7RM');
      });
    });

    it('shows error message on failed verify', async () => {
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Session not found' }),
      });

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.getByText('Session not found')).toBeTruthy();
      });
    });

    it('shows joining state while verifying', async () => {
      let resolveVerify: (value: unknown) => void;
      fetchMock.mockReturnValueOnce(new Promise(r => { resolveVerify = r; }));

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      expect(screen.getByText('Joining…')).toBeTruthy();

      // Resolve to avoid unhandled promise
      await act(async () => {
        resolveVerify!({ json: () => Promise.resolve({ success: true, data: {} }) });
      });
    });

    it('shows toast and resets to idle on network error', async () => {
      const toast = await import('react-hot-toast');
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      await waitFor(() => {
        expect(toast.default.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
      });

      // Button should be back to idle state
      expect(screen.getByRole('button', { name: /Join workshop/i })).toBeTruthy();
    });

    it('does not allow double submit while joining', async () => {
      let resolveVerify: (value: unknown) => void;
      fetchMock.mockReturnValueOnce(new Promise(r => { resolveVerify = r; }));

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      const form = screen.getByRole('button', { name: /Join workshop/i }).closest('form')!;

      await act(async () => {
        fireEvent.submit(form);
      });

      // Try submitting again while in joining state
      await act(async () => {
        fireEvent.submit(form);
      });

      // Should only have called fetch once
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveVerify!({ json: () => Promise.resolve({ success: true, data: {} }) });
      });
    });

    it('disables inputs while joining', async () => {
      let resolveVerify: (value: unknown) => void;
      fetchMock.mockReturnValueOnce(new Promise(r => { resolveVerify = r; }));

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1') as HTMLInputElement,
        screen.getByLabelText('Join code character 2') as HTMLInputElement,
        screen.getByLabelText('Join code character 3') as HTMLInputElement,
        screen.getByLabelText('Join code character 4') as HTMLInputElement,
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      // All inputs should be disabled during joining
      inputs.forEach(input => {
        expect(input.disabled).toBe(true);
      });

      await act(async () => {
        resolveVerify!({ json: () => Promise.resolve({ success: true, data: {} }) });
      });
    });

    it('clears error state when user types after an error', async () => {
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      });

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy();
      });

      // Type in first input to clear error
      fireEvent.change(inputs[0], { target: { value: 'A' } });

      // Error should be cleared
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('uses default error message when API returns no error text', async () => {
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false }),
      });

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      await waitFor(() => {
        expect(screen.getByText(/double-check it with your facilitator/)).toBeTruthy();
      });
    });
  });

  describe('arrow key navigation', () => {
    it('ArrowLeft moves focus to previous input', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;

      fireEvent.change(input1, { target: { value: 'K' } });
      act(() => { input2.focus(); });

      fireEvent.keyDown(input2, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(input1);
    });

    it('ArrowRight moves focus to next input', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;

      act(() => { input1.focus(); });
      fireEvent.keyDown(input1, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(input2);
    });

    it('ArrowLeft on first input does nothing', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      act(() => { input1.focus(); });
      fireEvent.keyDown(input1, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(input1);
    });

    it('ArrowRight on last input does nothing', () => {
      render(<HomePage />);
      const input4 = screen.getByLabelText('Join code character 4') as HTMLInputElement;

      act(() => { input4.focus(); });
      fireEvent.keyDown(input4, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(input4);
    });
  });

  describe('accessibility', () => {
    it('decorative blobs are hidden from screen readers', () => {
      render(<HomePage />);
      const blobs = document.querySelector('[aria-hidden="true"]');
      expect(blobs).toBeTruthy();
    });

    it('all inputs have accessible labels', () => {
      render(<HomePage />);
      for (let i = 1; i <= 4; i++) {
        const input = screen.getByLabelText(`Join code character ${i}`);
        expect(input.tagName).toBe('INPUT');
      }
    });

    it('error message has alert role', async () => {
      fetchMock.mockResolvedValueOnce({
        json: () => Promise.resolve({ success: false, error: 'Bad code' }),
      });

      render(<HomePage />);
      const inputs = [
        screen.getByLabelText('Join code character 1'),
        screen.getByLabelText('Join code character 2'),
        screen.getByLabelText('Join code character 3'),
        screen.getByLabelText('Join code character 4'),
      ];

      fireEvent.change(inputs[0], { target: { value: 'K' } });
      fireEvent.change(inputs[1], { target: { value: '7' } });
      fireEvent.change(inputs[2], { target: { value: 'R' } });
      fireEvent.change(inputs[3], { target: { value: 'M' } });

      await act(async () => {
        fireEvent.submit(screen.getByRole('button', { name: /Join workshop/i }).closest('form')!);
      });

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert.textContent).toContain('Bad code');
      });
    });
  });

  describe('paste edge cases', () => {
    it('filters out invalid characters from paste', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      act(() => { input1.focus(); });
      // Paste contains invalid chars (I, O, 0, 1)
      fireEvent.change(input1, { target: { value: 'KI0M' } });

      // Only valid chars should be distributed: K, M
      expect(input1.value).toBe('K');
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;
      expect(input2.value).toBe('M');
    });

    it('handles paste shorter than 4 characters', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      act(() => { input1.focus(); });
      fireEvent.change(input1, { target: { value: 'AB' } });

      expect(input1.value).toBe('A');
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;
      expect(input2.value).toBe('B');
      const input3 = screen.getByLabelText('Join code character 3') as HTMLInputElement;
      expect(input3.value).toBe('');
    });

    it('handles paste longer than 4 characters (truncates to 4)', () => {
      render(<HomePage />);
      const input1 = screen.getByLabelText('Join code character 1') as HTMLInputElement;

      act(() => { input1.focus(); });
      fireEvent.change(input1, { target: { value: 'K7RMXYZ' } });

      expect(input1.value).toBe('K');
      const input2 = screen.getByLabelText('Join code character 2') as HTMLInputElement;
      expect(input2.value).toBe('7');
      const input3 = screen.getByLabelText('Join code character 3') as HTMLInputElement;
      expect(input3.value).toBe('R');
      const input4 = screen.getByLabelText('Join code character 4') as HTMLInputElement;
      expect(input4.value).toBe('M');
    });
  });
});
