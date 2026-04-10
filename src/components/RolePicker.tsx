import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SELLERS, MONTORS, ADMIN_USERS, PIN_CODES, type RoleType, type UserRole } from '@/lib/constants';

interface RolePickerProps {
  onRoleSelected: (role: UserRole) => void;
}

export function RolePicker({ onRoleSelected }: RolePickerProps) {
  const [roleType, setRoleType] = useState<RoleType | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);

  const people = roleType === 'seller' ? SELLERS : roleType === 'montor' ? MONTORS : [];

  const handleLogin = () => {
    const correctPin = PIN_CODES[name];
    if (pin !== correctPin) {
      setPinError(true);
      return;
    }
    setPinError(false);
    onRoleSelected({
      type: roleType!,
      name,
      isAdmin: ADMIN_USERS.includes(name),
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.png" alt="SmartKlimat" className="h-[120px] w-[120px] rounded-full object-contain" />
          <h1 className="text-2xl font-bold text-card-foreground">SmartKlimat N3prenad</h1>
          <p className="text-muted-foreground">Välj din roll för att komma igång</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={roleType === 'seller' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('seller'); setName(''); setPin(''); setPinError(false); }}
            >
              Säljare
            </Button>
            <Button
              variant={roleType === 'montor' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('montor'); setName(''); setPin(''); setPinError(false); }}
            >
              Montör
            </Button>
          </div>

          {roleType && (
            <Select value={name} onValueChange={(v) => { setName(v); setPin(''); setPinError(false); }}>
              <SelectTrigger>
                <SelectValue placeholder={`Välj ${roleType === 'seller' ? 'säljare' : 'montör'}...`} />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {name && (
            <div className="space-y-3">
              <div>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Ange PIN-kod (4 siffror)"
                  value={pin}
                  onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setPinError(false); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && pin.length === 4) handleLogin(); }}
                  className="h-12 text-center text-lg tracking-[0.5em]"
                />
                {pinError && <p className="text-sm text-destructive mt-1">Fel PIN-kod</p>}
              </div>
              <Button className="w-full h-12" disabled={pin.length !== 4} onClick={handleLogin}>
                Logga in
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
