import React, { useEffect, useState, useCallback } from "react";
// THEMED: directory cards preserve existing doctor create/edit flows.
import {
  createDoctor,
  fetchAppointments,
  fetchDoctors,
  fetchSettings,
  updateDoctor,
  type AppointmentRecord,
  type DoctorRecord,
  type SettingsRecord
} from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { Card, CardHeader } from "../../ui/Card";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Modal } from "../../ui/Modal";
import { PageLoader } from "../../ui/Spinner";
import { getDayNameFromDateInput, getSlotSummary } from "../../../utils/slot-visibility";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface DoctorFormState {
  name: string;
  specialty: string;
  specialization: string;
  clinicName: string;
  contactNumber: string;
  fee: string;
  language: string;
  active: boolean;
}

interface CreateDoctorFormState {
  name: string;
  specialization: string;
  clinicName: string;
  contactNumber: string;
  fee: string;
  language: string;
  email: string;
  password: string;
}

const EMPTY_CREATE_FORM: CreateDoctorFormState = {
  name: "",
  specialization: "",
  clinicName: "Sunrise Clinic",
  contactNumber: "",
  fee: "",
  language: "en-IN",
  email: "",
  password: ""
};

export function DirectoryPage() {
  const { token, user } = useAuth();
  const [doctors, setDoctors]   = useState<DoctorRecord[]>([]);
  const [settings, setSettings] = useState<SettingsRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [slotDate, setSlotDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slotDay, setSlotDay] = useState(() => getDayNameFromDateInput(new Date().toISOString().slice(0, 10)));
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Edit modal
  const [editDoc, setEditDoc] = useState<DoctorRecord | null>(null);
  const [form, setForm]       = useState<DoctorFormState>({ name: "", specialty: "", specialization: "", clinicName: "", contactNumber: "", fee: "", language: "en-IN", active: true });
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateDoctorFormState>(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdCredential, setCreatedCredential] = useState<{ email: string; password: string } | null>(null);

  const isAdmin = user?.role === "ADMIN";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [d, s, a] = await Promise.all([fetchDoctors(token), fetchSettings(token), fetchAppointments(token)]);
      setDoctors(d);
      setSettings(s);
      setAppointments(a);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load directory.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function openEdit(doc: DoctorRecord) {
    setEditDoc(doc);
    setForm({
      name: doc.name,
      specialty: doc.specialty,
      specialization: doc.specialization,
      clinicName: doc.clinicName,
      contactNumber: doc.contactNumber,
      fee: String(doc.fee ?? ""),
      language: doc.language ?? "en-IN",
      active: doc.active,
    });
    setSaveError("");
  }

  async function handleSave() {
    if (!editDoc || !token) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateDoctor(token, editDoc.doctorId, { ...form, fee: parseFloat(form.fee) || 0 });
      await load();
      setEditDoc(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  function openCreate() {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError("");
    setCreatedCredential(null);
    setCreateOpen(true);
  }

  function handleSlotDateChange(value: string) {
    setSlotDate(value);
    setSlotDay(getDayNameFromDateInput(value));
  }

  async function handleCreateDoctor() {
    if (!token) return;
    setCreating(true);
    setCreateError("");
    setCreatedCredential(null);
    try {
      const fee = parseFloat(createForm.fee);
      if (!createForm.name.trim() || !createForm.specialization.trim() || !createForm.clinicName.trim() || Number.isNaN(fee)) {
        throw new Error("Doctor name, specialization, clinic name, and fee are required.");
      }
      if (!createForm.email.trim() || !createForm.password.trim()) {
        throw new Error("Email and password are required for doctor login.");
      }

      await createDoctor(token, {
        name: createForm.name.trim(),
        specialization: createForm.specialization.trim(),
        specialty: createForm.specialization.trim(),
        clinicName: createForm.clinicName.trim(),
        contactNumber: createForm.contactNumber.trim(),
        fee,
        language: createForm.language.trim() || "en-IN",
        email: createForm.email.trim(),
        password: createForm.password
      });

      await load();
      setCreatedCredential({ email: createForm.email.trim(), password: createForm.password });
      setCreateForm((current) => ({ ...EMPTY_CREATE_FORM, clinicName: current.clinicName }));
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Doctor creation failed.");
    } finally {
      setCreating(false);
    }
  }

  // Transfer info from settings
  const transferNumbers = [...new Set(settings.map((s) => s.transferNumber).filter(Boolean))];
  const clinicName = settings[0]?.doctorName ? undefined : undefined; // use doctor clinicName

  if (loading) return <PageLoader />;
  if (error)   return <div className="text-red-500 text-sm p-4">{error}</div>;

  return (
    <div className="space-y-6">
      {/* Hospital Overview */}
      {settings.length > 0 && (
        <Card>
          <CardHeader title="Hospital / Clinic Info" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <p className="text-xs text-indigo-500 font-medium mb-1">Transfer Numbers</p>
              {transferNumbers.length > 0
                ? transferNumbers.map((n) => (
                    <p key={n} className="text-sm font-mono font-semibold text-slate-800">{n}</p>
                  ))
                : <p className="text-sm text-slate-400">Not configured</p>}
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <p className="text-xs text-emerald-600 font-medium mb-1">Total Doctors</p>
              <p className="text-2xl font-bold text-slate-800">{doctors.length}</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
              <p className="text-xs text-amber-600 font-medium mb-1">Active Doctors</p>
              <p className="text-2xl font-bold text-slate-800">{doctors.filter((d) => d.active).length}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Doctors list */}
      <Card>
        <CardHeader
          title="Doctors"
          subtitle={`${doctors.length} registered`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={slotDate}
                onChange={(e) => handleSlotDateChange(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={slotDay}
                onChange={(e) => setSlotDay(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {DAYS.map((day) => <option key={day} value={day}>{day} slots</option>)}
              </select>
              {isAdmin && <Button id="add-doctor" size="sm" onClick={openCreate}>Add Doctor</Button>}
            </div>
          }
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {doctors.map((doc) => {
            const slotSummary = getSlotSummary(doc, appointments, slotDay, slotDate);

            return (
              <div
                key={doc.id}
                className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 hover:shadow-card transition-all duration-150"
              >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-indigo-600">
                      {doc.name?.[0]?.toUpperCase() ?? "D"}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
                    <p className="text-xs text-slate-500">{doc.specialization || doc.specialty}</p>
                  </div>
                </div>
                <Badge variant={doc.active ? "success" : "neutral"} dot>
                  {doc.active ? "Active" : "Inactive"}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs text-slate-500">
                {doc.clinicName && (
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                    {doc.clinicName}
                  </div>
                )}
                {doc.contactNumber && (
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07" /></svg>
                    <span className="font-mono">{doc.contactNumber}</span>
                  </div>
                )}
                {doc.fee ? (
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
                    ₹{doc.fee} consultation fee
                  </div>
                ) : null}
                {doc.scheduleLabel && (
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    {doc.scheduleLabel}
                  </div>
                )}
              </div>

              {/* Availability */}
              {doc.availability && doc.availability.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {DAYS.map((day) => {
                    const slot = doc.availability.find((a) => a.day === day);
                    const available = slot && !slot.blocked && !slot.leave;
                    return (
                      <span
                        key={day}
                        title={slot ? `${slot.start}–${slot.end}` : day}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${available ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}
                      >
                        {day.slice(0, 2)}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">{slotDay} slots</p>
                  <Badge variant={slotSummary.availableSlots.length > 0 ? "success" : "warning"}>
                    {slotSummary.availableSlots.length > 0 ? "Available" : slotSummary.unavailableReason ?? "Full"}
                  </Badge>
                </div>

                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Open</p>
                  <div className="flex flex-wrap gap-1">
                    {slotSummary.availableSlots.length > 0 ? (
                      slotSummary.availableSlots.slice(0, 4).map((slot) => (
                        <span key={slot} className="rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                          {slot}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        None
                      </span>
                    )}
                    {slotSummary.availableSlots.length > 4 && (
                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        +{slotSummary.availableSlots.length - 4}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase text-slate-400 mb-1">Booked</p>
                  <div className="flex flex-wrap gap-1">
                    {slotSummary.bookedSlots.length > 0 ? (
                      slotSummary.bookedSlots.slice(0, 3).map((slot) => (
                        <span key={`${slot.time}-${slot.patientName}`} className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {slot.time} · {slot.patientName}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        None
                      </span>
                    )}
                    {slotSummary.bookedSlots.length > 3 && (
                      <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                        +{slotSummary.bookedSlots.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <Button
                    id={`edit-doctor-${doc.doctorId}`}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => openEdit(doc)}
                    icon={<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>}
                  >
                    Edit
                  </Button>
                </div>
              )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Edit Doctor Modal */}
      <Modal
        open={!!editDoc}
        onClose={() => setEditDoc(null)}
        title={`Edit — ${editDoc?.name ?? ""}`}
        size="md"
      >
        <div className="space-y-4">
          {[
            { label: "Doctor Name", key: "name" as const, type: "text" },
            { label: "Specialty", key: "specialty" as const, type: "text" },
            { label: "Specialization", key: "specialization" as const, type: "text" },
            { label: "Clinic Name", key: "clinicName" as const, type: "text" },
            { label: "Contact Number", key: "contactNumber" as const, type: "tel" },
            { label: "Consultation Fee (₹)", key: "fee" as const, type: "number" },
            { label: "Language", key: "language" as const, type: "text" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input
                type={type}
                value={form[key] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              id="doctor-active"
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="w-4 h-4 accent-indigo-600"
            />
            <label htmlFor="doctor-active" className="text-sm text-slate-700">Active</label>
          </div>
          {saveError && <p className="text-xs text-red-500">{saveError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setEditDoc(null)}>Cancel</Button>
            <Button id="save-doctor" variant="primary" size="sm" loading={saving} onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Doctor"
        size="md"
      >
        <div className="space-y-4">
          {[
            { label: "Doctor Name", key: "name" as const, type: "text" },
            { label: "Specialization", key: "specialization" as const, type: "text" },
            { label: "Clinic Name", key: "clinicName" as const, type: "text" },
            { label: "Contact Number", key: "contactNumber" as const, type: "tel" },
            { label: "Consultation Fee", key: "fee" as const, type: "number" },
            { label: "Language", key: "language" as const, type: "text" },
            { label: "Login Email", key: "email" as const, type: "email" },
            { label: "Temporary Password", key: "password" as const, type: "text" },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input
                type={type}
                value={createForm[key]}
                onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
          {createdCredential && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <p className="font-semibold">Doctor login created</p>
              <p className="font-mono mt-1">{createdCredential.email}</p>
              <p className="font-mono">{createdCredential.password}</p>
            </div>
          )}
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>Close</Button>
            <Button id="create-doctor" variant="primary" size="sm" loading={creating} onClick={handleCreateDoctor}>Create Doctor</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
