$body = '{"username":"admin","password":"admin1234"}'
$login = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method POST -ContentType "application/json" -Body $body
Write-Host "Test 1 (Login Success): Token received: $($login.token -ne $null), Role: $($login.role)"

try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/auth/login" -Method POST -ContentType "application/json" -Body '{"username":"admin","password":"bad"}'
} catch {
    Write-Host "Test 2 (Login Failed): $_"
}

try {
    Invoke-RestMethod -Uri "http://localhost:8080/api/auth/me" -Method GET
} catch {
    Write-Host "Test 3 (Protected w/o token): $_"
}

$headers = @{ "Authorization" = "Bearer $($login.token)" }
$me = Invoke-RestMethod -Uri "http://localhost:8080/api/auth/me" -Method GET -Headers $headers
Write-Host "Test 4 (Protected w/ token): Username: $($me.username), Role: $($me.role)"
