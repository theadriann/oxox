import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export interface UpdatePromptProps {
  downloadedVersion: string | null
  onDismiss: () => void
  onRestart: () => void
}

export function UpdatePrompt({ downloadedVersion, onDismiss, onRestart }: UpdatePromptProps) {
  return (
    <div className="mx-4 mt-2" data-testid="update-prompt">
      <Alert>
        <AlertTitle>Update ready</AlertTitle>
        <AlertDescription>
          {downloadedVersion
            ? `Version ${downloadedVersion} has been downloaded and is ready to install.`
            : 'A downloaded update is ready to install.'}
        </AlertDescription>
        <AlertAction className="flex items-center gap-2">
          <Button size="xs" variant="ghost" type="button" onClick={onDismiss}>
            Later
          </Button>
          <Button size="xs" type="button" onClick={onRestart}>
            Restart to update
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}
