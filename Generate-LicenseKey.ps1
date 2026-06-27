function Get-HardwareID {
    try {
        $boardUUID = (Get-CimInstance Win32_ComputerSystemProduct).UUID
        $cpuID = (Get-CimInstance Win32_Processor).ProcessorId
        if ([string]::IsNullOrEmpty($boardUUID) -or $boardUUID -eq "00000000-0000-0000-0000-000000000000") {
            $boardUUID = (Get-CimInstance Win32_BIOS).SerialNumber
        }
        return "$boardUUID-$cpuID".Trim()
    }
    catch {
        return $null
    }
}

function New-SerialFromHWID {
    param (
        [string]$hwid
    )
    
    # Secret Salt parts (Must match main.js)
    $salt = "PhotoEditorPRO_Licensing_System_SecretSalt_2026_@#$!"
    
    if (-not $hwid) { return $null }
    
    # Phase 1: SHA256 of hwid + salt
    $input1 = $hwid + $salt
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $bytes1 = [System.Text.Encoding]::UTF8.GetBytes($input1)
    $hashBytes1 = $hasher.ComputeHash($bytes1)
    $hash1 = (($hashBytes1 | ForEach-Object { "{0:X2}" -f $_ }) -join "").ToLower()

    # Phase 2: Reverse hash1 to increase complexity
    $charArray = $hash1.ToCharArray()
    [Array]::Reverse($charArray)
    $reversedHash1 = -join $charArray

    # Phase 3: SHA256 of reversedHash1 + salt + hwid
    $input2 = $reversedHash1 + $salt + $hwid
    $bytes2 = [System.Text.Encoding]::UTF8.GetBytes($input2)
    $hashBytes2 = $hasher.ComputeHash($bytes2)
    $hash2 = ($hashBytes2 | ForEach-Object { "{0:X2}" -f $_ }) -join ""
    
    # Phase 4: Format as XXXXX-XXXXX-XXXXX-XXXXX
    $cleanHex = $hash2.Substring(0, 20)
    $serial = ""
    for ($i = 0; $i -lt $cleanHex.Length; $i += 5) {
        if ($i -gt 0) { $serial += "-" }
        $serial += $cleanHex.Substring($i, 5)
    }
    
    return $serial
}

# --- Execution ---
Clear-Host
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ">> Photo Editor PRO License Key Generator" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Prompt HWID
Write-Host "Please enter the customer Hardware ID (HWID):" -ForegroundColor Yellow
Write-Host "(Or press Enter to generate key for this local PC)" -ForegroundColor Gray
$inputHwid = (Read-Host).Trim()

$targetHwid = ""
$isLocal = $false

if ([string]::IsNullOrEmpty($inputHwid)) {
    Write-Host ""
    Write-Host "No HWID entered. Reading local Hardware ID..." -ForegroundColor Gray
    $targetHwid = Get-HardwareID
    $isLocal = $true
} else {
    $targetHwid = $inputHwid
}

if (-not $targetHwid) {
    Write-Host "[ERROR] Could not retrieve Hardware ID!" -ForegroundColor Red
} else {
    $serial = New-SerialFromHWID -hwid $targetHwid
    
    Write-Host ""
    Write-Host "================ GENERATION RESULTS ================" -ForegroundColor Green
    if ($isLocal) {
        Write-Host "Computer Name  : $env:COMPUTERNAME" -ForegroundColor White
    }
    Write-Host "Hardware ID    : $targetHwid" -ForegroundColor White
    Write-Host "License Key    : $serial" -ForegroundColor Green
    Write-Host "====================================================" -ForegroundColor Green
    
    # Copy key to clipboard
    try {
        Set-Clipboard -Value $serial
        Write-Host ">> Info: License Key copied to your clipboard!" -ForegroundColor Gray
    } catch {}
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Read-Host "Press Enter to exit..."