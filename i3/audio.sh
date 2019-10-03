#!/bin/bash
light=$(xbacklight)
light=$( printf "%.0f" $light )


while [ $light -lt 95 ] && [ $light -gt 5 ]; do

        bindsym XF86MonBrightnessUp exec xbacklight -dec 10 # increase screen brightness
        bindsym XF86MonBrightnessDown exec xbacklight -inc 10 # decrease screen brightness

done
