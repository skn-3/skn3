import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SELLERS, MONTORS, type RoleType, type UserRole } from '@/lib/constants';
import { Thermometer } from 'lucide-react';

interface RolePickerProps {
  onRoleSelected: (role: UserRole) => void;
}

export function RolePicker({ onRoleSelected }: RolePickerProps) {
  const [roleType, setRoleType] = useState<RoleType | null>(null);
  const [name, setName] = useState('');

  const people = roleType === 'seller' ? SELLERS : roleType === 'montor' ? MONTORS : [];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary">
            <Thermometer className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-card-foreground">SmartKlimat N3prenad</h1>
          <p className="text-muted-foreground">Välj din roll för att komma igång</p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={roleType === 'seller' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('seller'); setName(''); }}
            >
              Säljare
            </Button>
            <Button
              variant={roleType === 'montor' ? 'default' : 'outline'}
              className="h-12"
              onClick={() => { setRoleType('montor'); setName(''); }}
            >
              Montör
            </Button>
          </div>

          {roleType && (
            <Select value={name} onValueChange={setName}>
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
            <Button className="w-full h-12" onClick={() => onRoleSelected({ type: roleType!, name })}>
              Fortsätt som {name}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
