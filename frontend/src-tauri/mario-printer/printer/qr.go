package printer

func QRCode(value string, size int) []byte {
	if size <= 0 {
		size = 6
	}

	var out []byte

	// CENTER ALIGN
	out = append(out, []byte{0x1B, 0x61, 0x01}...)

	// MODEL 2
	out = append(out, []byte{
		0x1D, 0x28, 0x6B,
		0x04, 0x00,
		0x31, 0x41,
		0x32, 0x00,
	}...)

	// SIZE
	out = append(out, []byte{
		0x1D, 0x28, 0x6B,
		0x03, 0x00,
		0x31, 0x43,
		byte(size),
	}...)

	// ERROR CORRECTION
	out = append(out, []byte{
		0x1D, 0x28, 0x6B,
		0x03, 0x00,
		0x31, 0x45,
		0x30,
	}...)

	qrData := []byte(value)
	dataLen := len(qrData) + 3
	pL := byte(dataLen % 256)
	pH := byte(dataLen / 256)

	// STORE DATA
	out = append(out, []byte{
		0x1D, 0x28, 0x6B,
		pL, pH,
		0x31, 0x50,
		0x30,
	}...)

	out = append(out, qrData...)

	// PRINT QR
	out = append(out, []byte{
		0x1D, 0x28, 0x6B,
		0x03, 0x00,
		0x31, 0x51,
		0x30,
	}...)

	out = append(out, []byte("\n\n")...)

	return out
}
