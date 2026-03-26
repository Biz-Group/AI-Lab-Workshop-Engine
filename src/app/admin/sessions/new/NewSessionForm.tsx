'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Rocket, ChevronDown } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import toast from 'react-hot-toast';

interface Template {
  id: string;
  name: string;
  description: string | null;
  estimated_duration_minutes: number;
}

interface ClientOption {
  id: string;
  name: string;
  poc_name: string | null;
  poc_email: string | null;
}

interface NewSessionFormProps {
  templates: Template[];
  clients: ClientOption[];
}

export function NewSessionForm({ templates, clients }: NewSessionFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    template_id: templates[0]?.id || '',
    client_name: '',
    department: '',
    location: '',
    poc_name: '',
    poc_email: '',
    event_type: 'halfday' as 'keynote' | 'halfday' | 'fullday',
    event_date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Client dropdown state
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.template_id) newErrors.template_id = 'Please select a template';
    if (!formData.client_name.trim()) newErrors.client_name = 'Client name is required';
    if (!formData.location.trim()) newErrors.location = 'Location is required';
    if (!formData.poc_name.trim()) newErrors.poc_name = 'Point of contact name is required';
    if (!formData.poc_email.trim()) {
      newErrors.poc_email = 'POC email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.poc_email)) {
      newErrors.poc_email = 'Please enter a valid email address';
    }
    if (!formData.event_date) newErrors.event_date = 'Date and time are required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/admin/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          event_date: new Date(formData.event_date).toISOString(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || 'Failed to create session');
        setIsSubmitting(false);
        return;
      }

      toast.success(`Session created! Join code: ${data.session.joinCode}`);
      router.push(`/session/${data.session.id}/presenter`);
    } catch {
      toast.error('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const selectClient = (client: ClientOption) => {
    setFormData(prev => ({
      ...prev,
      client_name: client.name,
      poc_name: client.poc_name || prev.poc_name,
      poc_email: client.poc_email || prev.poc_email,
    }));
    setClientSearch('');
    setClientDropdownOpen(false);
    // Clear errors on autofilled fields
    setErrors(prev => {
      const next = { ...prev };
      delete next.client_name;
      if (client.poc_name) delete next.poc_name;
      if (client.poc_email) delete next.poc_email;
      return next;
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workshop Template <span className="text-red-500">*</span>
            </label>
            {templates.length > 0 ? (
              <select
                value={formData.template_id}
                onChange={(e) => updateField('template_id', e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-gray-900 font-medium"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.estimated_duration_minutes} min)
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                No published templates found. Please create and publish a template first.
              </p>
            )}
            {errors.template_id && <p className="text-sm text-red-500 mt-1">{errors.template_id}</p>}
          </div>

          <hr className="border-gray-200" />

          {/* Client Name (searchable dropdown) & Department */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div ref={clientRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 border rounded-lg bg-white text-left transition-colors ${
                  errors.client_name ? 'border-red-500' : 'border-gray-300 focus:ring-2 focus:ring-brand-500'
                }`}
              >
                <span className={formData.client_name ? 'text-gray-900' : 'text-gray-400'}>
                  {formData.client_name || 'Select a client…'}
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>
              {clientDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Search clients…"
                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-500"
                      autoFocus
                    />
                  </div>
                  <div className="overflow-y-auto max-h-48">
                    {filteredClients.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-gray-500 text-center">
                        {clients.length === 0
                          ? 'No approved clients. Add them in Organization settings.'
                          : 'No matching clients found'}
                      </div>
                    ) : (
                      filteredClients.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectClient(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 transition-colors ${
                            formData.client_name === c.name ? 'bg-brand-50 text-brand-700 font-medium' : 'text-gray-700'
                          }`}
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
              {errors.client_name && <p className="text-sm text-red-500 mt-1">{errors.client_name}</p>}
            </div>
            <div>
              <Input
                label="Department"
                value={formData.department}
                onChange={(e) => updateField('department', e.target.value)}
                placeholder="e.g. Marketing, HR, IT"
              />
            </div>
          </div>

          {/* Location */}
          <Input
            label="Location"
            value={formData.location}
            onChange={(e) => updateField('location', e.target.value)}
            placeholder="e.g. Dubai Office, Online, Conference Room A"
            error={errors.location}
            required
          />

          {/* POC Name & Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="POC Name"
              value={formData.poc_name}
              onChange={(e) => updateField('poc_name', e.target.value)}
              placeholder="e.g. Jane Smith"
              error={errors.poc_name}
              required
            />
            <Input
              label="POC Email"
              type="email"
              value={formData.poc_email}
              onChange={(e) => updateField('poc_email', e.target.value)}
              placeholder="e.g. jane@acme.com"
              error={errors.poc_email}
              required
            />
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type of Event <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'keynote', label: 'Keynote', desc: '~1 hour' },
                { value: 'halfday', label: 'Half Day', desc: '~3-4 hours' },
                { value: 'fullday', label: 'Full Day', desc: '~6-8 hours' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField('event_type', opt.value)}
                  className={`p-3 rounded-lg border-2 text-center transition-colors ${
                    formData.event_type === opt.value
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Date and Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date &amp; Time <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={formData.event_date}
              onChange={(e) => updateField('event_date', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {errors.event_date && <p className="text-sm text-red-500 mt-1">{errors.event_date}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between mt-6">
        <Link
          href="/admin/sessions"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </Link>
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={templates.length === 0}
        >
          {!isSubmitting && <Rocket className="w-4 h-4 mr-2" />}
          Create &amp; Launch Session
        </Button>
      </div>
    </form>
  );
}
